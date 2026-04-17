import type {NextConfig} from 'next';

const projectDir = import.meta.dirname;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'motion'],
  },
  outputFileTracingExcludes: {
    '/api/pi/**': ['./next.config.ts', './tests/**'],
  },
  // Expose the CI commit SHA so the desktop Settings panel can show the
  // exact build. Falls back to 'dev' in local dev. GITHUB_SHA is set by
  // GitHub Actions automatically on every push/PR run.
  env: {
    NEXT_PUBLIC_BUILD_SHA: (process.env.GITHUB_SHA ?? 'dev').slice(0, 7),
  },
  // Emit `.next/standalone/server.js` + a minimal `node_modules` subset so
  // the Tauri desktop bundle can ship a self-contained Next runtime. Vercel
  // ignores `output: 'standalone'` and uses its own adapter, so this is
  // safe for both deploy targets.
  output: 'standalone',
  // Pin the standalone trace root to THIS project dir. Without this Next
  // auto-detects a workspace root higher up (any ancestor with a lockfile)
  // and replicates that path tree inside .next/standalone, so server.js
  // ends up at `.next/standalone/projects/<name>/server.js` instead of the
  // flat layout our Tauri server wrapper expects.
  outputFileTracingRoot: projectDir,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.leonardo.ai',
        port: '',
        pathname: '/**',
      },
    ],
  },
  transpilePackages: ['motion'],
};

export default nextConfig;
