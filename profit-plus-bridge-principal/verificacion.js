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

/** Cada costo por el nombre de su columna en art; 0 cuando está vacío. */
const costosDe = (costos) =>
  Object.fromEntries(Object.entries(costos ?? {}).map(([columna, valor]) => [columna, numero(valor)]));

/** Un artículo como debería llegar a la web: el código de barra es la
 * referencia (o el código interno), el SKU el campo Modelo, la categoría la
 * línea y la marca la categoría de Profit (o su código, si no tiene
 * nombre). Profit admite existencias negativas; en la web es 0. Los costos
 * van tal cual están en Profit (cuál usa la web lo decide la web), o null
 * cuando el bridge es anterior a la 1.3.0 y no los manda. */
function esperado({
  codigo,
  referencia,
  modelo,
  nombre,
  lineaCodigo,
  linea,
  marcaCodigo,
  marca,
  stock,
  precio1,
  precio2,
  costos,
}) {
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
    costos: costos === null ? null : costosDe(costos),
  };
}

/** Una fila de art (con lin_art y cat_art), la existencia sumada de st_almac
 * y las columnas de costo que se leyeron. */
function deProfit(fila, stock, columnasCosto = []) {
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
    costos: Object.fromEntries(columnasCosto.map((columna) => [columna, fila[columna]])),
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
    costos: producto.costos === undefined ? null : producto.costos,
  });
}

/** Un producto del catálogo público de la web (/products/catalog). Ese
 * catálogo no publica el costo: solo se compara con el bridge. */
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
  const cambios = CAMPOS.filter(([campo]) => {
    if (campo === 'stock' && conSecundaria) return real.stock < deseado.stock - 0.005;
    return NUMERICOS.has(campo)
      ? Math.abs(deseado[campo] - real[campo]) >= 0.005
      : deseado[campo] !== real[campo];
  }).map(([campo, etiqueta]) => ({ campo: etiqueta, esperado: deseado[campo], real: real[campo] }));
  // Los costos, columna por columna, cuando los dos lados los tienen.
  if (deseado.costos && real.costos) {
    for (const [columna, valor] of Object.entries(deseado.costos)) {
      const suyo = real.costos[columna] ?? 0;
      if (Math.abs(valor - suyo) >= 0.005) cambios.push({ campo: `costo ${columna}`, esperado: valor, real: suyo });
    }
  }
  return cambios;
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
      // Desde la 1.2.0 el bridge dice de qué columna sale el SKU, y desde
      // la 1.3.0, de cuáles salen los costos.
      anteriorA120: !('columnaSku' in bridge),
      anteriorA130: !('columnasCosto' in bridge),
      columnaSku: bridge.columnaSku ?? null,
      columnasCosto: bridge.columnasCosto ?? [],
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

const conCosto = (articulo) => Object.values(articulo.costos ?? {}).some((valor) => valor > 0);
const costosEnLinea = (articulo) =>
  conCosto(articulo)
    ? ` | costos ${Object.entries(articulo.costos)
        .map(([columna, valor]) => `${columna} ${valor}`)
        .join(', ')}`
    : '';
const enLinea = (a) =>
  `  ${a.codigo} | barra ${a.codigoDeBarra} | SKU ${a.sku ?? '—'} | ${a.nombre} | stock ${a.stock} | detal ${a.precioDetal} | mayor ${a.precioMayor}${costosEnLinea(a)}`;

/** El informe, en líneas de texto, y cuántas diferencias encontró. */
function informe(resultado, { columnaSku, columnasCosto = [], errores = [] }) {
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
  if (columnasCosto.length === 0) {
    out('Columnas de costo: no se encontró ninguna en la tabla art');
  } else {
    const llenos = (columna) => articulos.filter((a) => (a.costos?.[columna] ?? 0) > 0).length;
    out(`Columnas de costo: ${columnasCosto.map((c) => `art.${c} (${llenos(c)} con valor)`).join(', ')}`);
    out(`Artículos con algún costo: ${articulos.filter(conCosto).length} de ${articulos.length}`);
    // Un costo por encima del precio detal casi siempre es otra moneda (o un
    // error al cargarlo): la web no tiene cómo saberlo.
    for (const columna of columnasCosto) {
      const mayores = articulos.filter((a) => a.precioDetal > 0 && (a.costos?.[columna] ?? 0) > a.precioDetal);
      if (mayores.length) {
        out(
          `  art.${columna} es mayor que el precio detal en ${mayores.length} artículo(s): ¿está en otra moneda? ${lista(mayores.map((a) => a.codigo))}`,
        );
      }
    }
  }
  if (barrasRepetidas.length) out(`Códigos de barra repetidos (corregir en Profit): ${lista(barrasRepetidas)}`);
  if (skusRepetidos.length) out(`SKU repetidos (corregir en Profit): ${lista(skusRepetidos)}`);
  out();
  out(`Muestra (los primeros ${Math.min(MUESTRA, articulos.length)}):`);
  for (const a of articulos.slice(0, MUESTRA)) out(enLinea(a));
  const costeados = articulos.filter(conCosto);
  if (costeados.length) {
    out();
    out(`Muestra con costo (los primeros ${Math.min(MUESTRA, costeados.length)} que tienen alguno):`);
    for (const a of costeados.slice(0, MUESTRA)) out(enLinea(a));
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
  } else if (bridge?.anteriorA130) {
    avisosBridge.push(
      'El bridge que está corriendo es anterior a la 1.3.0 y no manda los costos: copia los archivos nuevos y reinicia la tarea "ElectronPlus Bridge Principal".',
    );
  }
  if (bridge && !bridge.anteriorA120 && bridge.columnaSku !== columnaSku) {
    avisosBridge.push(
      `El bridge toma el SKU de ${bridge.columnaSku ? `art.${bridge.columnaSku}` : 'ninguna columna'}; aquí se encontró ${columnaSku ? `art.${columnaSku}` : 'ninguna'}.`,
    );
  }
  if (bridge && !bridge.anteriorA130 && bridge.columnasCosto.join(',') !== columnasCosto.join(',')) {
    const nombres = (cols) => (cols.length ? cols.map((c) => `art.${c}`).join(', ') : 'ninguna');
    avisosBridge.push(
      `El bridge toma los costos de ${nombres(bridge.columnasCosto)}; aquí se encontró ${nombres(columnasCosto)}.`,
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
