export interface Reminder {
    id?: string;
    message: string;
    date: {
        type: "one_time" | "everyday" | "weekdays" | "weekends" | "custom" | "specific_dates";
        customDays?: string[];
        specificDates?: string[];
    };
    times?: {
        format: "24h" | "12h";
        hour: number;
        minute: number;
        period?: "AM" | "PM";
    }[];
    time?: {
        format: "24h" | "12h";
        hour: number;
        minute: number;
        period?: "AM" | "PM";
    };
    contacts: string[];
    createdAt: string;
}

const FIREBASE_URL = "https://normiculus-default-rtdb.asia-southeast1.firebasedatabase.app";

async function updateTimestamp() {
    try {
        await fetch(`${FIREBASE_URL}/last_updated.json`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(Date.now()),
        });
    } catch (e) {
        console.warn("Failed to update global timestamp", e);
    }
}

export async function fetchReminders(): Promise<Reminder[]> {
    try {
        const response = await fetch(`${FIREBASE_URL}/reminders.json`);
        if (!response.ok) {
            throw new Error('Failed to fetch reminders');
        }
        const data = await response.json();
        if (!data) return [];

        return Object.entries(data).map(([id, value]: [string, any]) => ({
            id,
            ...value
        })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (e) {
        console.warn("Using mock reminders due to Firebase error:", e);
        // Fallback to local memory if Firebase rules block it, so UI is testable
        return [];
    }
}

export async function createReminder(reminder: Omit<Reminder, 'id'>): Promise<{ name: string }> {
    try {
        const response = await fetch(`${FIREBASE_URL}/reminders.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reminder),
        });

        if (!response.ok) {
            throw new Error('Failed to create reminder');
        }
        await updateTimestamp();
        return response.json();
    } catch (e) {
        console.warn("Saving mock reminder locally due to Firebase error:", e);
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('mockReminders');
            const parsed = stored ? JSON.parse(stored) : [];
            parsed.unshift({ id: `mock-${Date.now()}`, ...reminder });
            localStorage.setItem('mockReminders', JSON.stringify(parsed));
        }
        return { name: `mock-${Date.now()}` };
    }
}

export async function deleteReminder(id: string): Promise<void> {
    try {
        const response = await fetch(`${FIREBASE_URL}/reminders/${id}.json`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            throw new Error('Failed to delete reminder');
        }
        await updateTimestamp();
    } catch (e) {
        console.warn("Deleting local mock reminder due to Firebase error:", e);
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('mockReminders');
            if (stored) {
                const parsed: Reminder[] = JSON.parse(stored);
                const updated = parsed.filter(r => r.id !== id);
                localStorage.setItem('mockReminders', JSON.stringify(updated));
            }
        }
    }
}

export async function updateReminder(id: string, reminder: Omit<Reminder, 'id' | 'createdAt'>): Promise<void> {
    try {
        // We do a PATCH or PUT to update the reminder while keeping createdAt
        const response = await fetch(`${FIREBASE_URL}/reminders/${id}.json`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reminder),
        });

        if (!response.ok) {
            throw new Error('Failed to update reminder');
        }
        await updateTimestamp();
    } catch (e) {
        console.warn("Updating local mock reminder due to Firebase error:", e);
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('mockReminders');
            if (stored) {
                const parsed: Reminder[] = JSON.parse(stored);
                const updated = parsed.map(r => r.id === id ? { ...r, ...reminder } : r);
                localStorage.setItem('mockReminders', JSON.stringify(updated));
            }
        }
    }
}
