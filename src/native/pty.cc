/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
#include <node.h>

#ifndef WINDOWS
#include "scoped_fd.h"
#include <termios.h>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#endif

static void _throw_exc(v8::Isolate *isolate, const char *message) {
  isolate->ThrowException(
      v8::Exception::Error(v8::String::NewFromUtf8(isolate, message)));
}

#ifndef WINDOWS
static void _throw_exc_format(v8::Isolate *isolate, int error,
                              const char *function_name) {
  const int ERRMSG_MAX_SIZE = 128;
  char errmsg_buffer[ERRMSG_MAX_SIZE];
  char message[ERRMSG_MAX_SIZE];
  char *errmsg = strerror_r(error, errmsg_buffer, ERRMSG_MAX_SIZE);
  snprintf(message, ERRMSG_MAX_SIZE, "%s: %s", function_name, errmsg);
  _throw_exc(isolate, message);
}
#endif

// see: man ptmx
static void create_pty(const v8::FunctionCallbackInfo<v8::Value> &args) {
  v8::Isolate *isolate = args.GetIsolate();
#ifdef WINDOWS
  return _throw_exc(isolate, ".create_pty() is not supported on Windows");
#else
  scoped_fd master_fd(open("/dev/ptmx", O_RDWR));
  if (master_fd == -1) {
    return _throw_exc(isolate, "open(\"/dev/ptmx\", O_RDWR) failed");
  }
  const int SLAVE_NAME_MAX_SIZE = 128;
  char slave_name[SLAVE_NAME_MAX_SIZE];
  termios configuration;
  int error;

  error = tcgetattr(master_fd.get(), &configuration);
  if (error)
    return _throw_exc_format(isolate, error, "tcgetattr");

  cfmakeraw(&configuration);

  error = tcsetattr(master_fd.get(), 0, &configuration);
  if (error)
    return _throw_exc_format(isolate, error, "tcsetattr");

  error = ptsname_r(master_fd.get(), slave_name, SLAVE_NAME_MAX_SIZE);
  if (error)
    return _throw_exc_format(isolate, error, "ptsname_r");
  error = grantpt(master_fd.get());
  if (error)
    return _throw_exc_format(isolate, error, "grantpt");
  error = unlockpt(master_fd.get());
  if (error)
    return _throw_exc_format(isolate, error, "unlockpt");

  v8::Local<v8::Object> terminal = v8::Object::New(isolate);
  terminal->Set(v8::String::NewFromUtf8(isolate, "master_fd"),
                v8::Number::New(isolate, master_fd.release()));
  terminal->Set(v8::String::NewFromUtf8(isolate, "slave_name"),
                v8::String::NewFromUtf8(isolate, slave_name));
  args.GetReturnValue().Set(terminal);
#endif
}

static void initialize(v8::Local<v8::Object> exports) {
  NODE_SET_METHOD(exports, "create_pty", create_pty);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, initialize);
