// src/pages/Login.tsx
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useSendOtpMutation, useLoginMutation } from '@/redux/slice/auth/authApiSlice';
import { getRoleFromStorage } from '@/lib/auth';

const ROLE = { TELECALLER: 1, ADMIN: 2 } as const;

export default function Login() {
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [sendOtp, { isLoading: sending }]   = useSendOtpMutation();
  const [login,   { isLoading: verifying }] = useLoginMutation();

  // if token already present → direct role path
  const loggedInTarget = useMemo(() => {
    const role = getRoleFromStorage(); // 1 | 2 | null
    if (role === 2) return '/admin';
    if (role === 1) return '/telecaller';
    return null;
  }, [location.key]); // location.key changes on navigation, cheap signal

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  const canSend   = /^\d{10}$/.test(mobile);
  const canVerify = /^\d{6}$/.test(otp) && canSend;

  const handleSendOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSend) {
      toast({ title: 'Invalid number', description: 'Enter a valid 10-digit mobile', variant: 'destructive' });
      return;
    }
    try {
      const res = await sendOtp({ mobile }).unwrap();
      if (res?.sent) {
        setIsOtpSent(true);
        setCountdown(30);
        toast({ title: 'OTP sent', description: 'Check your phone.' });
      } else throw new Error('Unable to send OTP');
    } catch (err: any) {
      toast({ title: 'Error', description: err?.data?.message || err?.message || 'Failed to send OTP', variant: 'destructive' });
    }
  };

  const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canVerify) {
      toast({ title: 'Invalid OTP', description: 'Enter a valid 6-digit OTP', variant: 'destructive' });
      return;
    }
    try {
      const { user } = await login({ mobile, otp }).unwrap(); // token saved in authApi onQueryStarted
      const code = (String(user?.role).toLowerCase() === 'admin' || user?.role === 2) ? ROLE.ADMIN : ROLE.TELECALLER;
      navigate(code === ROLE.ADMIN ? '/admin' : '/telecaller', { replace: true });
    } catch (err: any) {
      toast({ title: 'Login failed', description: err?.data?.message || err?.message || 'Invalid OTP', variant: 'destructive' });
    }
  };

  const handleResend = async () => {
    if (!canSend || countdown > 0) return;
    try {
      const res = await sendOtp({ mobile }).unwrap();
      if (res?.sent) {
        setCountdown(30);
        toast({ title: 'OTP resent', description: 'We sent a new OTP.' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.data?.message || err?.message || 'Failed to resend OTP', variant: 'destructive' });
    }
  };

  // If already logged in → direct (no query params)
  if (loggedInTarget && location.pathname !== loggedInTarget) {
    return <Navigate to={loggedInTarget} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <Card className="w-full max-w-md shadow-xl rounded-2xl border border-blue-100 dark:border-gray-700 overflow-hidden">
        <CardHeader className="space-y-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-6">
          <div className="flex justify-center mb-4">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <CardTitle className="text-3xl font-bold text-center">Lead Manager</CardTitle>
          <CardDescription className="text-center text-blue-100">
            {isOtpSent ? 'Enter the OTP sent to your mobile' : 'Enter your mobile number to receive OTP'}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6">
          {!isOtpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mobile">Mobile Number</Label>
                <div className="relative">
                  <Input
                    id="mobile"
                    type="tel"
                    inputMode="numeric"
                    placeholder="Enter your mobile number"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    required
                    className="pl-10 border-blue-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">+91</span>
                </div>
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 transition-colors" disabled={sending || !canSend}>
                {sending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>) : 'Send OTP'}
              </Button>
            </form>
          ) : (
            <>
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">OTP</Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    maxLength={6}
                    className="border-blue-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                  />
                </div>
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 transition-colors" disabled={verifying || !canVerify}>
                  {verifying ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</>) : 'Verify OTP'}
                </Button>
              </form>

              <div className="mt-4 flex justify-between text-sm">
                <Button variant="link" className="text-blue-600 hover:text-blue-800" onClick={() => { setIsOtpSent(false); setOtp(''); setCountdown(0); }}>
                  Change mobile number
                </Button>
                <Button variant="link" className="text-blue-600 hover:text-blue-800" onClick={handleResend} disabled={countdown > 0 || !canSend}>
                  Resend OTP {countdown > 0 && `(${countdown}s)`}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
