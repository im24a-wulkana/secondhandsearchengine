import Navbar from '@/components/Navbar';
import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Create account · Thrifthound' };

export default function RegisterPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
        <AuthForm mode="register" />
      </main>
    </>
  );
}
