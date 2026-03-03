import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createReminder, updateReminder, type Reminder } from '@/lib/firebase';
import { X, PlusCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdded: () => void;
    reminderToEdit?: Reminder | null;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function AddReminderModal({ isOpen, onClose, onAdded, reminderToEdit }: ModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [dateType, setDateType] = useState<Reminder['date']['type']>('one_time');
    const [customDays, setCustomDays] = useState<string[]>([]);
    const [specificDates, setSpecificDates] = useState<string[]>(['']);

    const [times, setTimes] = useState<string[]>(['12:00']);

    const [message, setMessage] = useState('');
    const [contacts, setContacts] = useState<string[]>(['']);



    // Reset or Initialize state on open
    useEffect(() => {
        if (isOpen) {
            if (reminderToEdit) {
                setDateType(reminderToEdit.date.type);
                setCustomDays(reminderToEdit.date.customDays || []);
                setSpecificDates(reminderToEdit.date.specificDates || ['']);

                let initialTimes = ['12:00'];
                if (reminderToEdit.times && reminderToEdit.times.length > 0) {
                    initialTimes = reminderToEdit.times.map(t => `${t.hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}`);
                } else if (reminderToEdit.time) {
                    initialTimes = [`${reminderToEdit.time.hour.toString().padStart(2, '0')}:${reminderToEdit.time.minute.toString().padStart(2, '0')}`];
                }
                setTimes(initialTimes);

                setMessage(reminderToEdit.message);
                setContacts(reminderToEdit.contacts?.length ? reminderToEdit.contacts : ['']);
            } else {
                setDateType('one_time');
                setCustomDays([]);
                setSpecificDates(['']);
                setTimes(['12:00']);
                setMessage('');
                setContacts(['']);
            }
            setError(null);
        }
    }, [isOpen, reminderToEdit]);



    // 5-minute inactivity timeout
    useEffect(() => {
        if (!isOpen) return;

        let timeoutId: ReturnType<typeof setTimeout>;
        const resetTimer = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                onClose();
            }, 5 * 60 * 1000); // 5 minutes
        };

        resetTimer();

        const events = ['mousemove', 'keydown', 'mousedown', 'touchstart'];
        const handleActivity = () => resetTimer();

        events.forEach(event => document.addEventListener(event, handleActivity));

        return () => {
            clearTimeout(timeoutId);
            events.forEach(event => document.removeEventListener(event, handleActivity));
        };
    }, [isOpen, onClose]);



    const toggleDay = (day: string) => {
        setCustomDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
    };

    const addSpecificDateRow = () => setSpecificDates([...specificDates, '']);
    const removeSpecificDateRow = (index: number) => setSpecificDates(specificDates.filter((_, i) => i !== index));
    const handleSpecificDateChange = (index: number, val: string) => {
        const newDates = [...specificDates];
        newDates[index] = val;
        setSpecificDates(newDates);
    };

    const addTimeRow = () => setTimes([...times, '12:00']);
    const removeTimeRow = (index: number) => setTimes(times.filter((_, i) => i !== index));
    const handleTimeChange = (index: number, val: string) => {
        const newTimes = [...times];
        newTimes[index] = val;
        setTimes(newTimes);
    };

    const handleContactChange = (index: number, val: string) => {
        // Only allow numbers
        const numericVal = val.replace(/\D/g, '');
        const newContacts = [...contacts];
        newContacts[index] = numericVal;
        setContacts(newContacts);
    };

    const addContactRow = () => setContacts([...contacts, '']);
    const removeContactRow = (index: number) => setContacts(contacts.filter((_, i) => i !== index));

    const handleSubmit = async () => {
        if (!message.trim()) {
            setError('Message is required.');
            return;
        }
        const cleanContacts = contacts.filter(c => c.length > 0);

        if (dateType === 'custom' && customDays.length === 0) {
            setError('Please select at least one day for custom frequency.');
            return;
        }

        const cleanSpecificDates = specificDates.filter(d => d.trim().length > 0);
        if (dateType === 'specific_dates' && cleanSpecificDates.length === 0) {
            setError('Please add at least one specific date.');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const payload: Omit<Reminder, 'id'> = {
                message,
                date: {
                    type: dateType,
                    customDays: dateType === 'custom' ? customDays : undefined,
                    specificDates: dateType === 'specific_dates' ? cleanSpecificDates : undefined
                },
                times: times.map(t => ({
                    format: '24h' as const,
                    hour: parseInt(t.split(':')[0], 10),
                    minute: parseInt(t.split(':')[1], 10)
                })),
                contacts: cleanContacts,
                createdAt: new Date().toISOString()
            };

            if (reminderToEdit?.id) {
                await updateReminder(reminderToEdit.id, payload);
            } else {
                await createReminder(payload);
            }
            onAdded();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save reminder. Check database rules.');
        } finally {
            setLoading(false);
        }
    };

    // Removed handle hour slider hook

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[600px] bg-zinc-950 border border-zinc-800 text-zinc-100 max-h-[90vh] overflow-y-auto w-[95vw] shadow-2xl shadow-blue-900/20">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-white">
                        {reminderToEdit ? 'Edit Reminder' : 'Create Reminder'}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Automate exactly when and to whom this reminder is sent.
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-3 text-red-400 text-sm">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                <div className="space-y-6 py-4 px-1">
                    {/* 1) Date Picker */}
                    <div className="space-y-3">
                        <Label className="text-zinc-300 font-semibold">Frequency / Date</Label>
                        <Select value={dateType} onValueChange={(val: any) => setDateType(val)}>
                            <SelectTrigger className="w-full bg-zinc-900 border-zinc-800 text-zinc-100 h-12 focus:ring-blue-500">
                                <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                                <SelectItem value="one_time">One Time</SelectItem>
                                <SelectItem value="everyday">Everyday</SelectItem>
                                <SelectItem value="weekdays">Weekdays</SelectItem>
                                <SelectItem value="weekends">Weekends</SelectItem>
                                <SelectItem value="custom">Custom Days...</SelectItem>
                                <SelectItem value="specific_dates">Specific Dates...</SelectItem>
                            </SelectContent>
                        </Select>

                        {dateType === 'custom' && (
                            <div className="flex flex-wrap gap-2 mt-3 pt-2">
                                {DAYS.map(day => (
                                    <button
                                        key={day}
                                        type="button"
                                        onClick={() => toggleDay(day)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all border ${customDays.includes(day)
                                            ? 'bg-blue-600 border-blue-500 text-white'
                                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'
                                            }`}
                                    >
                                        {day.substring(0, 3)}
                                    </button>
                                ))}
                            </div>
                        )}

                        {dateType === 'specific_dates' && (
                            <div className="mt-3 pt-2 space-y-3">
                                {specificDates.map((d, i) => (
                                    <div key={i} className="flex gap-2 isolate group">
                                        <Input
                                            type="date"
                                            value={d}
                                            onChange={(e) => handleSpecificDateChange(i, e.target.value)}
                                            className="bg-zinc-900 border-zinc-800 text-zinc-100 focus-visible:ring-blue-500 [color-scheme:dark] h-11"
                                        />
                                        {specificDates.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => removeSpecificDateRow(i)}
                                                className="h-11 w-11 px-0 flex-shrink-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                                            >
                                                <X className="h-5 w-5" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={addSpecificDateRow}
                                    className="mt-2 text-xs font-semibold border-dashed border-zinc-700 hover:border-blue-500 hover:text-blue-400 text-zinc-400"
                                >
                                    <PlusCircle className="h-4 w-4 mr-1.5" />
                                    Add Date
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* 2) Time Picker(s) */}
                    <div className="space-y-3">
                        <Label className="text-zinc-300 font-semibold">Time(s) of Day</Label>
                        <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                            {times.map((t, index) => (
                                <div key={index} className="space-y-1 z-10 relative">
                                    <div className="flex gap-2 isolate group">
                                        <Input
                                            type="time"
                                            value={t}
                                            onChange={(e) => handleTimeChange(index, e.target.value)}
                                            className="flex-1 bg-zinc-900 border-zinc-800 text-zinc-100 h-11 focus-visible:ring-blue-500 [color-scheme:dark] cursor-pointer"
                                            required
                                        />
                                        {times.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => removeTimeRow(index)}
                                                className="h-11 w-11 px-0 flex-shrink-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                                            >
                                                <X className="h-5 w-5" />
                                            </Button>
                                        )}
                                    </div>

                                </div>
                            ))}
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addTimeRow}
                            className="mt-2 text-xs font-semibold border-dashed border-zinc-700 hover:border-blue-500 hover:text-blue-400 text-zinc-400"
                        >
                            <PlusCircle className="h-4 w-4 mr-1.5" />
                            Add Time
                        </Button>
                    </div>

                    {/* 3) Message Field */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="message" className="text-zinc-300 font-semibold">Reminder Message</Label>
                            <span className={`text-xs font-mono font-medium ${message.length > 1400 ? 'text-red-400' : 'text-zinc-500'}`}>
                                {message.length} / 1500
                            </span>
                        </div>
                        <Textarea
                            id="message"
                            placeholder="What do you want to be reminded about?"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            maxLength={1500}
                            className="min-h-[120px] bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-blue-500 resize-y"
                        />
                    </div>

                    {/* 4) Contacts Section */}
                    <div className="space-y-3">
                        <Label className="text-zinc-300 font-semibold">Recipients (Contacts)</Label>
                        <p className="text-xs text-zinc-500 -mt-1 mb-3">Only numeric values (include country code without +)</p>

                        <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                            {contacts.map((contact, index) => (
                                <div key={index} className="flex gap-2 isolate group">
                                    <div className="relative flex-1">
                                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-500 font-mono">
                                            +
                                        </div>
                                        <Input
                                            type="tel"
                                            value={contact}
                                            onChange={(e) => handleContactChange(index, e.target.value)}
                                            placeholder="919876543210"
                                            className="pl-7 bg-zinc-900 border-zinc-800 text-zinc-100 h-11 focus-visible:ring-slate-500 font-mono"
                                        />
                                    </div>
                                    {contacts.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => removeContactRow(index)}
                                            className="h-11 w-11 px-0 flex-shrink-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                                        >
                                            <X className="h-5 w-5" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addContactRow}
                            className="mt-2 text-xs font-semibold border-dashed border-zinc-700 hover:border-blue-500 hover:text-blue-400 text-zinc-400"
                        >
                            <PlusCircle className="h-4 w-4 mr-1.5" />
                            Add Contact
                        </Button>
                    </div>
                </div>

                <DialogFooter className="bg-zinc-950 pt-6 mt-2 border-t border-zinc-800/50">
                    <Button variant="ghost" onClick={onClose} disabled={loading} className="text-zinc-400 hover:text-white hover:bg-zinc-800">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="font-bold min-w-[140px] bg-blue-600 hover:bg-blue-500 text-white"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : reminderToEdit ? 'Update Reminder' : 'Publish Reminder'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
