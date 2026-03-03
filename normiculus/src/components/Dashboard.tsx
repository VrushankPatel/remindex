import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardFooter } from '@/components/ui/card';
import { fetchReminders, deleteReminder, type Reminder } from '@/lib/firebase';
import { PlusCircle, LogOut, Clock, Calendar, Users, AlertCircle, MoreHorizontal, Trash, Edit2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import AddReminderModal from '@/components/AddReminderModal';

interface DashboardProps {
    onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [reminderToEdit, setReminderToEdit] = useState<Reminder | null>(null);

    const loadReminders = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await fetchReminders();
            setReminders(data);
        } catch (err: any) {
            setError('Could not connect to database. Checking rules may be required.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReminders();
    }, []);

    const handleReminderAdded = () => {
        loadReminders(); // Refresh the list
    };

    const handleDelete = async (id?: string) => {
        if (!id) return;
        try {
            await deleteReminder(id);
            loadReminders();
        } catch (err) {
            console.error("Failed to delete reminder", err);
        }
    };

    const formatTime = (time: NonNullable<Reminder['time']>) => {
        if (time.format === '12h') {
            return `${time.hour}:${time.minute.toString().padStart(2, '0')} ${time.period}`;
        }
        return `${time.hour.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-12 relative overflow-hidden">
            {/* Background Decorative Blob */}
            <div className="absolute top-0 right-0 -mr-32 -mt-32 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 -ml-32 -mb-32 w-96 h-96 bg-slate-600/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="max-w-6xl mx-auto relative z-10 hidden" />

            <header className="max-w-6xl mx-auto flex items-center justify-between mb-12 relative z-10">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" alt="Normiculus Logo" className="w-10 h-10 md:w-14 md:h-14 object-contain drop-shadow-md" />
                    <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white">
                        Normiculus
                    </h1>
                </div>
                <Button variant="secondary" className="bg-zinc-800 text-zinc-100 hover:bg-zinc-700 hover:text-white border border-zinc-700" onClick={onLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                </Button>
            </header>

            <main className="max-w-6xl mx-auto relative z-10">
                <div className="flex justify-center mb-16">
                    <Button
                        size="lg"
                        className="group relative overflow-hidden rounded-full px-8 py-6 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-lg shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95"
                        onClick={() => setIsModalOpen(true)}
                    >
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
                        <span className="relative z-10 flex items-center gap-2">
                            <PlusCircle className="w-6 h-6" />
                            Add Reminder
                        </span>
                    </Button>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex items-center gap-3 text-red-400 mb-8 max-w-2xl mx-auto">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[...Array(3)].map((_, i) => (
                            <Card key={i} className="bg-zinc-900/50 border-zinc-800 animate-pulse h-64" />
                        ))}
                    </div>
                ) : reminders.length === 0 && !error ? (
                    <div className="text-center py-20 px-4 bg-zinc-900/30 border border-zinc-900 rounded-3xl backdrop-blur-sm">
                        <div className="bg-zinc-800/50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Clock className="w-10 h-10 text-zinc-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-zinc-300 mb-2">No Reminders Yet</h3>
                        <p className="text-zinc-500 max-w-sm mx-auto">You haven't added any reminders. Click the button above to get started.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {reminders.map((reminder) => (
                            <Card key={reminder.id} className="bg-zinc-900/60 backdrop-blur-md border border-zinc-800/50 hover:border-zinc-700 hover:shadow-xl hover:shadow-blue-500/5 transition-all group overflow-hidden">
                                <CardHeader className="pb-3 border-b border-zinc-800/50">
                                    <div className="flex justify-between items-start">
                                        <div className="flex gap-2">
                                            <div className="flex items-center text-blue-400 text-sm font-medium gap-1.5 bg-blue-500/10 px-2.5 py-1 rounded-full w-fit">
                                                <Calendar className="w-3.5 h-3.5" />
                                                <span className="capitalize">{reminder.date.type}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {(reminder.times || (reminder.time ? [reminder.time] : [])).map((t, idx) => (
                                                    <div key={idx} className="flex items-center text-slate-400 font-bold bg-slate-500/10 px-2.5 py-1 rounded-full w-fit">
                                                        <Clock className="w-4 h-4 mr-1.5" />
                                                        {formatTime(t)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-zinc-800 focus-visible:ring-0">
                                                    <span className="sr-only">Open menu</span>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-100">
                                                <DropdownMenuItem
                                                    onClick={() => {
                                                        setReminderToEdit(reminder);
                                                        setIsModalOpen(true);
                                                    }}
                                                    className="focus:bg-zinc-800 focus:text-white cursor-pointer flex items-center"
                                                >
                                                    <Edit2 className="w-4 h-4 mr-2" />
                                                    Edit Reminder
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => handleDelete(reminder.id)}
                                                    className="text-red-400 focus:text-red-300 focus:bg-red-500/10 cursor-pointer flex items-center"
                                                >
                                                    <Trash className="w-4 h-4 mr-2" />
                                                    Delete Reminder
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    {reminder.date.type === 'custom' && reminder.date.customDays && (
                                        <CardDescription className="text-zinc-500 mt-2 text-xs font-medium uppercase tracking-wider">
                                            {reminder.date.customDays.join(', ')}
                                        </CardDescription>
                                    )}
                                    {reminder.date.type === 'specific_dates' && reminder.date.specificDates && (
                                        <CardDescription className="text-zinc-500 mt-2 text-xs font-medium uppercase tracking-wider">
                                            {reminder.date.specificDates.map(d => new Date(d).toLocaleDateString()).join(', ')}
                                        </CardDescription>
                                    )}
                                </CardHeader>
                                <CardContent className="pt-5 pb-5">
                                    <p className="text-zinc-300 whitespace-pre-wrap leading-relaxed">
                                        {reminder.message}
                                    </p>
                                </CardContent>
                                <CardFooter className="pt-0 flex items-start flex-col gap-2">
                                    <div className="flex items-center text-zinc-500 text-sm font-medium">
                                        <Users className="w-4 h-4 mr-2" />
                                        {(reminder.contacts || []).length} Contact{(reminder.contacts || []).length !== 1 ? 's' : ''}
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {(reminder.contacts || []).map((contact, idx) => (
                                            <span key={idx} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded border border-zinc-700">
                                                {contact}
                                            </span>
                                        ))}
                                    </div>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </main>

            <AddReminderModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setTimeout(() => setReminderToEdit(null), 200); // delay clear layout jump
                }}
                onAdded={handleReminderAdded}
                reminderToEdit={reminderToEdit}
            />
        </div>
    );
}
