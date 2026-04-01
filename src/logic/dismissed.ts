export interface DismissedEntry {
    email: string;
    dismissedAt: number;
    action: "kept" | "unsubscribed";
}

export type CooldownSetting = "1week" | "1month" | "never";

const COOLDOWN_MS: Record<CooldownSetting, number> = {
    "1week": 7 * 24 * 60 * 60 * 1000,
    "1month": 30 * 24 * 60 * 60 * 1000,
    "never": Infinity,
}

// Key by account email so each account has its own dismissed list
function storageKey(accountEmail: string): string {
    return `dismissed_${accountEmail.toLowerCase()}`;
}

// Read the full list from storage for a specific account
export function getDismissedList(accountEmail: string): Promise<DismissedEntry[]> {
    const key = storageKey(accountEmail);
    return new Promise((resolve) => {
        chrome.storage.local.get(key, (data) => {
            resolve((data[key] as DismissedEntry[]) ?? []);
        });
    });
}

// Get the set of emails that should currently be hidden from scan results
export async function getActiveDismissedEmails(accountEmail: string): Promise<Set<string>> {
    const [list, cooldown] = await Promise.all([
        getDismissedList(accountEmail),                                                                                                                          
        getCooldownSetting(),                                                                                                                                
    ]);         

    const now = Date.now();                                                                                                                                  
    const maxAge = COOLDOWN_MS[cooldown];
                                                                                                                                                            
    const activeEmails = list
        .filter((entry) => {
            // Unsubscribed senders are always hidden                                                                                                        
            if (entry.action === "unsubscribed") return true;
            // Kept senders are hidden only if within the cooldown period                                                                                    
            return now - entry.dismissedAt < maxAge;
        })                                                                                                                                                   
        .map((entry) => entry.email);
                                                                                                                                                            
    return new Set(activeEmails);
}

// Add a single sender to the dismissed list
export async function addToDismissed(accountEmail: string, email: string, action: "kept" | "unsubscribed"): Promise<void> {
    const key = storageKey(accountEmail);
    const list = await getDismissedList(accountEmail);
    const normalized = email.toLowerCase();

    //Update existing entry or add new one
    const index = list.findIndex((e) => e.email === normalized);
    const entry: DismissedEntry = {email: normalized, dismissedAt: Date.now(), action};
    if (index >= 0) {
        list[index] = entry;
    } else {
        list.push(entry);
    }

    return new Promise((resolve) => {
        chrome.storage.local.set({[key]: list}, resolve);
    });
}

// Add multiple senders at once (used by batch action)
export async function addMultipleToDismissed(accountEmail: string, entries: { email: string; action: "kept" | "unsubscribed" }[]): Promise<void> {
    const key = storageKey(accountEmail);
    const list = await getDismissedList(accountEmail);                                                                                                           
    const now = Date.now();                                                                                                                                  
                
    for (const { email, action } of entries) {                                                                                                               
        const normalized = email.toLowerCase();
        const index = list.findIndex((e) => e.email === normalized);                                                                                         
        const entry: DismissedEntry = { email: normalized, dismissedAt: now, action };
                                                                                                                                                            
        if (index >= 0) {
            list[index] = entry;                                                                                                                             
        } else {
            list.push(entry);
        }
    }

    return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: list }, resolve);
    });                                                                                                                                                      
}

// Remove a single sender from the dismissed list
export async function removeFromDismissed(accountEmail: string, email: string): Promise<void> {
    const key = storageKey(accountEmail);
    const list = await getDismissedList(accountEmail);
    const filtered = list.filter((e) => e.email !== email.toLowerCase());                                                                                    

    return new Promise((resolve) => {                                                                                                                        
        chrome.storage.local.set({ [key]: filtered }, resolve);
    });
}                                                                                                                                                            

// Clear the entire dismissed list for an account
export function clearDismissed(accountEmail: string): Promise<void> {
    const key = storageKey(accountEmail);                                                                                                                        
    return new Promise((resolve) => {
        chrome.storage.local.remove(key, resolve);                                                                                                           
    });         
}

export function getCooldownSetting(): Promise<CooldownSetting> {                                                                                             
    return new Promise((resolve) => {
        chrome.storage.local.get("dismissedCooldown", (data) => {
            resolve((data.dismissedCooldown as CooldownSetting) ?? "1week");                                                                                 
        });
    });                                                                                                                                                      
}               

export function setCooldownSetting(value: CooldownSetting): Promise<void> {                                                                                  
    return new Promise((resolve) => {
        chrome.storage.local.set({ dismissedCooldown: value }, resolve);                                                                                     
    });         
}