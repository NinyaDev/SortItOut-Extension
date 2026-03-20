export interface UnsubscribeInfo {
    httpUrl: string | null;
    mailto: string | null;
    hasOneClick: boolean;
}

export interface SenderInfo {
    email: string;
    name: string;
    count: number;
    readCount: number;
    unsubscribe: UnsubscribeInfo;
    messageIds: string[];
}