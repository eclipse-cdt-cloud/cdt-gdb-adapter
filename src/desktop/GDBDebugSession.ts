/*********************************************************************
 * Copyright (c) 2018 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
import * as fs from 'fs';
import { DebugSession, logger } from '@vscode/debugadapter';
import {
    LaunchRequestArguments,
    AttachRequestArguments,
} from '../types/session';
import { GDBDebugSessionBase } from '../gdb/GDBDebugSessionBase';
import { GDBBackendFactory } from './factories/GDBBackendFactory';
import { IGDBBackendFactory } from '../types/gdb';

export class GDBDebugSession extends GDBDebugSessionBase {
    /**
     * Initial (aka default) configuration for launch/attach request
     * typically supplied with the --config command line argument.
     */
    protected static defaultRequestArguments?: any;

    /**
     *  resetDeviceCommands from launch.json
     */
    protected customResetCommands?: string[];

    /**
     * Frozen configuration for launch/attach request
     * typically supplied with the --config-frozen command line argument.
     */
    protected static frozenRequestArguments?: { request?: string };
    constructor(backendFactory?: IGDBBackendFactory) {
        super(backendFactory || new GDBBackendFactory());
        this.logger = logger;
    }

    /**
     * Main entry point
     */
    public static run(debugSession: typeof DebugSession) {
        GDBDebugSession.processArgv(process.argv.slice(2));
        DebugSession.run(debugSession);
    }

    /**
     * Parse an optional config file which is a JSON string of launch/attach request arguments.
     * The config can be a response file by starting with an @.
     */
    public static processArgv(args: string[]) {
        args.forEach(function (val, _index, _array) {
            const configMatch = /^--config(-frozen)?=(.*)$/.exec(val);
            if (configMatch) {
                let configJson;
                const configStr = configMatch[2];
                if (configStr.startsWith('@')) {
                    const configFile = configStr.slice(1);
                    configJson = JSON.parse(
                        fs.readFileSync(configFile).toString('utf8')
                    );
                } else {
                    configJson = JSON.parse(configStr);
                }
                if (configMatch[1]) {
                    GDBDebugSession.frozenRequestArguments = configJson;
                } else {
                    GDBDebugSession.defaultRequestArguments = configJson;
                }
            }
        });
    }

    /**
     * Apply the initial and frozen launch/attach request arguments.
     * @param request the default request type to return if request type is not frozen
     * @param args the arguments from the user to apply initial and frozen arguments to.
     * @returns resolved request type and the resolved arguments
     */
    protected applyRequestArguments(
        request: 'launch' | 'attach',
        args: LaunchRequestArguments | AttachRequestArguments
    ): ['launch' | 'attach', LaunchRequestArguments | AttachRequestArguments] {
        const frozenRequest = GDBDebugSession.frozenRequestArguments?.request;
        if (frozenRequest === 'launch' || frozenRequest === 'attach') {
            request = frozenRequest;
        }

        return [
            request,
            {
                ...GDBDebugSession.defaultRequestArguments,
                ...args,
                ...GDBDebugSession.frozenRequestArguments,
            },
        ];
    }
}
