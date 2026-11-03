'use strict';

/**
 * La comparación de `npm run verificar`, sin conexiones: qué debería tener
 * la web de cada artículo según Profit Plus, y en qué difiere lo que entrega
 * el bridge y lo que publica la web. Profit se lee de sus tablas tal cual
 * (no con la consulta del bridge), así un error del bridge no se compara
 * contra sí mismo.
 */

const texto = (valor) => String(valor ?? '').trim();
const numero = (valor) => Number(valor) || 0;

/** Lo que se compara de cada artículo, con su nombre en el informe. */
const CAMPOS = [
  ['codigoDeBarra', 'código de barra'],
  ['sku', 'SKU'],
  ['nombre', 'nombre'],
  ['categoria', 'categoría'],
  ['marca', 'marca'],
  ['stock', 'stock'],
  ['precioDetal', 'precio detal'],
  ['precioMayor', 'precio mayor'],
];
const NUMERICOS = new Set(['stock', 'precioDetal', 'precioMayor']);

/** Un artículo como debería llegar a la web: el código de barra es la
 * referencia (o el código interno), el SKU el campo Modelo, la categoría la
 * línea y la marca la categoría de Profit (o su código, si no tiene
 * nombre). Profit admite existencias negativas; en la web es 0. */
function esperado({ codigo, referencia, modelo, nombre, lineaCodigo, linea, marcaCodigo, marca, stock, precio1, precio2 }) {
  const interno = texto(codigo);
  const linCodigo = texto(lineaCodigo);
  const catCodigo = texto(marcaCodigo);
  return {
    codigo: interno,
    codigoDeBarra: texto(referencia) || interno,
    sku: texto(modelo) || null,
    nombre: texto(nombre),
    categoria: texto(linea) || (linCodigo ? `Categoría ${linCodigo}` : 'Sin categoría'),
    marca: texto(marca) || (catCodigo ? `Marca ${catCodigo}` : null),
    stock: Math.max(0, numero(stock)),
    precioDetal: numero(precio1),
    precioMayor: numero(precio2),
  };
}

/** Una fila de art (con lin_art y cat_art) y la existencia sumada de st_almac. */
function deProfit(fila, stock) {
  return esperado({
    codigo: fila.co_art,
    referencia: fila.ref,
    modelo: fila.modelo,
    nombre: fila.art_des,
    lineaCodigo: fila.co_lin,
    linea: fila.lin_des,
    marcaCodigo: fila.co_cat,
    marca: fila.cat_des,
    stock,
    precio1: fila.prec_vta1,
    precio2: fila.prec_vta2,
  });
}

/** Un producto de /api/productos-sincronizacion. */
function deBridge(producto) {
  return esperado({
    codigo: producto.codigo,
    referencia: producto.referencia,
    modelo: producto.modelo,
    nombre: producto.descripcion,
    lineaCodigo: producto.categoriaCodigo,
    linea: producto.categoria,
    marcaCodigo: producto.marcaCodigo,
    marca: producto.marca,
    stock: producto.stock,
    precio1: producto.precio1,
    precio2: producto.precio2,
  });
}

/** Un producto del catálogo público de la web (/products/catalog). */
function deWeb(producto) {
  return {
    codigoDeBarra: texto(producto.sku),
    sku: texto(producto.model) || null,
    nombre: texto(producto.name),
    categoria: texto(producto.category?.label),
    marca: texto(producto.brand) || null,
    stock: numero(producto.stock),
    precioDetal: numero(producto.retailPrice),
    precioMayor: numero(producto.wholesalePrice),
  };
}

/** La existencia de cada artículo: la suma de sus filas de st_almac, solo
 * las del almacén indicado si hay uno. SQL Server compara sin mayúsculas ni
 * espacios al final, y aquí igual. */
function existencias(filas, almacen) {
  const clave = (valor) => texto(valor).toUpperCase();
  const soloAlmacen = almacen ? clave(almacen) : null;
  const porArticulo = new Map();
  for (const fila of filas) {
    if (soloAlmacen && clave(fila.co_alma) !== soloAlmacen) continue;
    const articulo = clave(fila.co_art);
    porArticulo.set(articulo, (porArticulo.get(articulo) ?? 0) + numero(fila.stock_act));
  }
  return (codigo) => porArticulo.get(clave(codigo)) ?? 0;
}

/** Con `conSecundaria`, el stock puede ser mayor que el de Profit: la web
 * vende también las unidades de la tienda secundaria enlazadas al producto,
 * y las suma. Menor, nunca. */
function diferencias(deseado, real, { conSecundaria = false } = {}) {
  return CAMPOS.filter(([campo]) => {
    if (campo === 'stock' && conSecundaria) return real.stock < deseado.stock - 0.005;
    return NUMERICOS.has(campo)
      ? Math.abs(deseado[campo] - real[campo]) >= 0.005
      : deseado[campo] !== real[campo];
  }).map(([campo, etiqueta]) => ({ campo: etiqueta, esperado: deseado[campo], real: real[campo] }));
}

/** Los valores que tienen dos o más artículos (los vacíos no cuentan). */
function repetidos(valores) {
  const vistos = new Set();
  const repetidos = new Set();
  for (const valor of valores) {
    if (!valor) continue;
    if (vistos.has(valor)) repetidos.add(valor);
    vistos.add(valor);
  }
  return [...repetidos];
}

/**
 * Compara Profit con el bridge (por código interno) y con la web (por
 * código de barra: el catálogo público no publica el interno). `bridge` es
 * la respuesta del bridge y `web` la lista del catálogo, o null cuando no
 * se pudieron leer.
 */
function verificar({ profit, bridge, web }) {
  const barrasRepetidas = repetidos(profit.map((a) => a.codigoDeBarra));
  const resultado = {
    articulos: profit,
    barrasRepetidas,
    skusRepetidos: repetidos(profit.map((a) => a.sku)),
    bridge: null,
    web: null,
  };

  if (bridge) {
    const productos = bridge.productos ?? [];
    const enProfit = new Set(profit.map((a) => a.codigo));
    const porCodigo = new Map(productos.map((p) => [texto(p.codigo), deBridge(p)]));
    resultado.bridge = {
      total: productos.length,
      // Desde la 1.2.0 el bridge dice de qué columna sale el SKU.
      anteriorA120: !('columnaSku' in bridge),
      columnaSku: bridge.columnaSku ?? null,
      faltan: profit.filter((a) => !porCodigo.has(a.codigo)).map((a) => a.codigo),
      sobran: [...porCodigo.keys()].filter((codigo) => !enProfit.has(codigo)),
      difieren: profit
        .filter((a) => porCodigo.has(a.codigo))
        .map((a) => ({ codigo: a.codigo, cambios: diferencias(a, porCodigo.get(a.codigo)) }))
        .filter((d) => d.cambios.length > 0),
    };
  }

  if (web) {
    // Con un código de barra repetido no se sabe a qué artículo corresponde
    // el producto de la web: esos se informan aparte y no se comparan.
    const ambiguos = new Set(barrasRepetidas);
    const porBarra = new Map(web.map((p) => [texto(p.sku), deWeb(p)]));
    const comparables = profit.filter((a) => !ambiguos.has(a.codigoDeBarra));
    const publicados = comparables.filter((a) => porBarra.has(a.codigoDeBarra));
    resultado.web = {
      total: web.length,
      noPublicados: comparables.filter((a) => !porBarra.has(a.codigoDeBarra)).map((a) => a.codigo),
      conSecundaria: publicados.filter((a) => porBarra.get(a.codigoDeBarra).stock > a.stock + 0.005).length,
      difieren: publicados
        .map((a) => ({
          codigo: a.codigo,
          cambios: diferencias(a, porBarra.get(a.codigoDeBarra), { conSecundaria: true }),
        }))
        .filter((d) => d.cambios.length > 0),
    };
  }
  return resultado;
}

const MUESTRA = 15;
const LISTA = 50;

const lista = (valores) =>
  `${valores.length} — ${valores.slice(0, LISTA).join(', ')}${valores.length > LISTA ? ', …' : ''}`;

/** El informe, en líneas de texto, y cuántas diferencias encontró. */
function informe(resultado, { columnaSku, errores = [] }) {
  const lineas = [];
  const out = (linea = '') => lineas.push(linea);
  const { articulos, barrasRepetidas, skusRepetidos } = resultado;
  const conSku = articulos.filter((a) => a.sku).length;

  out('== Profit Plus');
  out(`Artículos activos: ${articulos.length}`);
  out(
    columnaSku
      ? `Campo Modelo (SKU): art.${columnaSku} — ${conSku} con SKU, ${articulos.length - conSku} sin SKU`
      : 'Campo Modelo (SKU): no se encontró en la tabla art',
  );
  if (barrasRepetidas.length) out(`Códigos de barra repetidos (corregir en Profit): ${lista(barrasRepetidas)}`);
  if (skusRepetidos.length) out(`SKU repetidos (corregir en Profit): ${lista(skusRepetidos)}`);
  out();
  out(`Muestra (los primeros ${Math.min(MUESTRA, articulos.length)}):`);
  for (const a of articulos.slice(0, MUESTRA)) {
    out(
      `  ${a.codigo} | barra ${a.codigoDeBarra} | SKU ${a.sku ?? '—'} | ${a.nombre} | stock ${a.stock} | detal ${a.precioDetal} | mayor ${a.precioMayor}`,
    );
  }

  if (errores.length) {
    out();
    out('== Errores');
    for (const error of errores) out(error);
  }

  /** Una sección de comparación; devuelve cuántas diferencias tiene. */
  const seccion = (titulo, datos, avisos, faltantes) => {
    out();
    out(`== ${titulo}`);
    if (!datos) {
      out('No se pudo leer (ver Errores).');
      return 0;
    }
    out(`Productos: ${datos.total}`);
    let problemas = datos.difieren.length;
    for (const aviso of avisos) {
      problemas += 1;
      out(aviso);
    }
    for (const [nombre, codigos] of faltantes) {
      problemas += codigos.length;
      if (codigos.length) out(`${nombre}: ${lista(codigos)}`);
    }
    if (datos.difieren.length === 0) out('Los datos de todos los artículos coinciden con Profit.');
    else out(`Artículos con datos distintos a Profit: ${datos.difieren.length}`);
    for (const { codigo, cambios } of datos.difieren.slice(0, LISTA)) {
      out(
        `  ${codigo}: ${cambios.map((c) => `${c.campo} ${JSON.stringify(c.esperado)} en Profit, ${JSON.stringify(c.real)} aquí`).join('; ')}`,
      );
    }
    if (datos.difieren.length > LISTA) out(`  … y ${datos.difieren.length - LISTA} más`);
    return problemas;
  };

  const { bridge, web } = resultado;
  const avisosBridge = [];
  if (bridge?.anteriorA120) {
    avisosBridge.push(
      'El bridge que está corriendo es anterior a la 1.2.0 y no manda el SKU: copia los archivos nuevos y reinicia la tarea "ElectronPlus Bridge Principal".',
    );
  } else if (bridge && bridge.columnaSku !== columnaSku) {
    avisosBridge.push(
      `El bridge toma el SKU de ${bridge.columnaSku ? `art.${bridge.columnaSku}` : 'ninguna columna'}; aquí se encontró ${columnaSku ? `art.${columnaSku}` : 'ninguna'}.`,
    );
  }
  let problemas = seccion('Bridge (lo que recibe la web)', bridge, avisosBridge, [
    ['En Profit pero no en el bridge', bridge?.faltan ?? []],
    ['En el bridge pero no activos en Profit', bridge?.sobran ?? []],
  ]);
  problemas += seccion('Web (catálogo público)', web, [], []);
  if (web?.conSecundaria) {
    out(
      `Con unidades de la tienda secundaria: ${web.conSecundaria} (la web suma al stock de Profit las de la secundaria enlazadas al producto; no es una diferencia)`,
    );
  }
  if (web?.noPublicados.length) {
    out(
      `No publicados en la web: ${lista(web.noPublicados)} (ocultos en el panel o todavía sin sincronizar; no es un error por sí solo)`,
    );
  }

  out();
  if (problemas === 0 && errores.length === 0) {
    out('RESULTADO: todo lo que llega de Profit es correcto.');
  } else {
    out(
      `RESULTADO: ${problemas} diferencia(s)${errores.length ? ` y ${errores.length} error(es)` : ''}. La web se sincroniza cada 15 minutos: un cambio reciente en Profit aparece como diferencia hasta la próxima sincronización.`,
    );
  }
  if (barrasRepetidas.length || skusRepetidos.length) {
    out('Hay códigos repetidos en Profit (ver arriba): conviene corregirlos allá.');
  }
  return { lineas, problemas };
}

module.exports = { deProfit, deBridge, deWeb, existencias, verificar, informe };
