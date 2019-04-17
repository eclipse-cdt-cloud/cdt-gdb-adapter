/*********************************************************************
 * Copyright (c) 2019 QNX Software Systems and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
#include <napi.h>

#include <signal.h>
#include <sys/types.h>
#include <string.h>
#include <errno.h>

namespace gdbSignal
{

static void _throw_exc(const Napi::Env env, const char *message)
{
    throw Napi::Error::New(env, message);
}

/**
 * Takes an error code and throws a pretty JS error such as:
 * "function_name: errormsg".
 */
static void _throw_exc_format(const Napi::Env env, int error,
                              const char *function_name)
{
    const int ERRMSG_MAX_SIZE = 128;
    char errmsg_buffer[ERRMSG_MAX_SIZE];
    char message[ERRMSG_MAX_SIZE];
    char *errmsg = strerror_r(error, errmsg_buffer, ERRMSG_MAX_SIZE);
    snprintf(message, ERRMSG_MAX_SIZE, "%s: %s", function_name, errmsg);
    _throw_exc(env, message);
}

static Napi::Value raise(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
#ifdef LINUX
    if (info.Length() < 3)
    {
        _throw_exc(env, "Too few args passed to .raise()");
    }

    if (!info[0].IsNumber() || !info[1].IsNumber() || !info[2].IsFunction())
    {
        _throw_exc(env, "Incorrect argument type. Use .raise(number, number, (string) => void)");
    }

    int pid = (int)info[0].ToNumber();
    int sig = (int)info[1].ToNumber();
    Napi::Function func = info[2].As<Napi::Function>();

    int status = -1;
    if ((status = killpg(pid, sig)) == -1)
    {
        char err[128];
        snprintf(err, 128, "Failed to killpg(%d, %d) %d (%s)", pid, sig, errno, strerror(errno));
        func.Call({Napi::String::New(env, err)});
        status = kill(pid, sig);
    }
    return Napi::Number::New(env, ((double)status));
#else
    // only supporting Linux for a first pass
    _throw_exc(env, ".raise() is only supported on Linux (for now)");
#endif
}

static Napi::Object initialize(Napi::Env env, Napi::Object exports)
{
    exports.Set("raise", Napi::Function::New(env, raise));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, initialize);
} // namespace gdbSignal
