/** @type {import('next').NextConfig} */
const nextConfig = {
  // Obligatorio para empaquetado en Docker multi-etapa (.next/standalone).
  // Genera un bundle mínimo que incluye únicamente las dependencias necesarias de node_modules.
  output: 'standalone',

  // Patrón Same-Origin: reescribe peticiones /api/* hacia el backend interno de Docker
  async rewrites() {
    const apiInternal = process.env.API_INTERNAL_URL || 'http://api:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiInternal}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
