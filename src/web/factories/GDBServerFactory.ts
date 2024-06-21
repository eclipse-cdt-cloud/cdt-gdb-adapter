import {
    TargetAttachRequestArguments,
    TargetLaunchRequestArguments,
} from '../../types/session';
import { IGDBServerFactory, IGDBServerProcessManager } from '../../types/gdb';
import { GDBServerWebProcessManager } from '../processManagers/GDBServerWebProcessManager';

export class GDBServerFactory implements IGDBServerFactory {
    async createGDBServerManager(
        args: TargetLaunchRequestArguments | TargetAttachRequestArguments
    ): Promise<IGDBServerProcessManager> {
        return new GDBServerWebProcessManager();
    }
}
