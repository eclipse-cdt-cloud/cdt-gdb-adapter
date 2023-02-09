import { Event } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';

export class ContinuedEvent extends Event implements DebugProtocol.ContinuedEvent {
    public body: {
        /** The thread which was continued. */
        threadId: number;
        /** If 'allThreadsContinued' is true, a debug adapter can announce that all threads have continued. */
        allThreadsContinued?: boolean;
    };

    constructor(threadId: number, allThreadsContinued?: false) {
        super('continued');
        this.body = { threadId, allThreadsContinued };
    }
}
