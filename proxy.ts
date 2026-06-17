import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next 16 renomeou a convenção `middleware` → `proxy` (mesma funcionalidade).
// Ver node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPath = path.startsWith("/login") || path.startsWith("/auth");
  // /api/* faz auth próprio (cron secret OR user session); proxy não redireciona
  const isApi = path.startsWith("/api/");
  const isPublicAsset =
    path.startsWith("/_next") || path.startsWith("/favicon") || isApi;

  if (!user && !isAuthPath && !isPublicAsset) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // t.js é servido público (snippet de tracking instalado nas LPs externas) —
  // não pode ser interceptado pelo redirect de login.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|t.js).*)"],
};
