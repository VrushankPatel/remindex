import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';


interface LoginProps {
    onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === 'zxcvbnm') {
            onLogin();
        } else {
            setError(true);
            setPassword('');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
            <Card className="w-full max-w-md border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl shadow-blue-500/10">
                <CardHeader className="space-y-4 text-center pb-2">
                    <div className="mx-auto w-24 h-24 flex items-center justify-center">
                        <img src="/logo.png" alt="Normiculus Logo" className="w-full h-full object-contain drop-shadow-xl" />
                    </div>
                    <CardTitle className="text-3xl font-bold tracking-tight">Normiculus</CardTitle>
                    <CardDescription className="text-zinc-400">
                        Enter your secure password to access your reminders.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setError(false);
                                }}
                                className={`bg-zinc-800 border-zinc-700 text-zinc-100 h-12 focus-visible:ring-blue-500 ${error ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            />
                            {error && <p className="text-sm text-red-500 mt-2">Incorrect password. Please try again.</p>}
                        </div>
                    </CardContent>
                    <CardFooter className="pt-4">
                        <Button type="submit" className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all">
                            Unlock Dashboard
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
