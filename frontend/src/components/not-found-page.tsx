import { Link } from "@tanstack/react-router";

/**
 * The store's 404, for any URL no route matches (routes/$.tsx, whose head
 * is NOT_FOUND_HEAD in lib/not-found.ts) and for a notFound() thrown while navigating (the
 * root's notFoundComponent, which adds the same tags itself).
 */
export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-surface px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-brand-navy">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-brand-navy">Página no encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La página que buscas no existe o fue movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-blue/90"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
