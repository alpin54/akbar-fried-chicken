import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);
const PUBLIC = ["/signin"];

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
  // Cek cepat keberadaan cookie; validitas session diperiksa di layout server & API.
  if (!isPublic && !req.cookies.get("fc_session")) {
    return NextResponse.redirect(new URL("/signin", req.url));
  }
  return intl(req);
}

export const config = {
  matcher: ["/((?!api/|_next|_vercel|.*\\..*).*)"],
};
