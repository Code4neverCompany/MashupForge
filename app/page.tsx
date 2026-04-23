import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { TechStack } from '@/components/landing/TechStack';
import { Footer } from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <Hero ctaHref="/app" />
      <Features />
      <TechStack />
      <Footer />
    </main>
  );
}
