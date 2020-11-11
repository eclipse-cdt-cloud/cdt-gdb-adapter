/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
#include "napi.h"

#ifdef LINUX
#include "scoped_fd.h"
#include <cstdlib>
#include <cstring>
#include <stdlib.h>
#include <fcntl.h>
#include <termios.h>

/**
 * Takes an error code and throws a pretty JS error such as:
 * "function_name: errormsg".
 */
static void _throw_exc_format(const Napi::Env env, int error,
                              const char *function_name) {
  const int ERRMSG_MAX_SIZE = 128;
  char errmsg_buffer[ERRMSG_MAX_SIZE];
  char message[ERRMSG_MAX_SIZE];
#ifdef _GNU_SOURCE
  char *errmsg = strerror_r(error, errmsg_buffer, ERRMSG_MAX_SIZE);
  snprintf(message, ERRMSG_MAX_SIZE, "%s: %s", function_name, errmsg);
#else
  int rc = strerror_r(error, errmsg_buffer, ERRMSG_MAX_SIZE);
  if (rc) {
    snprintf(message, ERRMSG_MAX_SIZE, "%s", function_name);
  } else {
    snprintf(message, ERRMSG_MAX_SIZE, "%s: %s", function_name, errmsg_buffer);
  }
#endif // _GNU_SOURCE
  throw Napi::Error::New(env, message);
}
#endif // LINUX

static Napi::Value create_pty(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
#ifndef LINUX
  // Windows does not supports TTYs.
  throw Napi::Error::New(env, ".create_pty() is not supported on this platform");
#else
  // master_fd will be closed on scope exit if an error is thrown.
  scoped_fd master_fd(posix_openpt(O_RDWR | O_NOCTTY));
  if (master_fd == -1) {
    throw Napi::Error::New(env, "posix_openpt(O_RDWR | O_NOCTTY) failed");
  }
  const int SLAVE_NAME_MAX_SIZE = 128;
  char slave_name[SLAVE_NAME_MAX_SIZE];
  termios configuration;
  int error;

  error = tcgetattr(master_fd.get(), &configuration);
  if (error)
    _throw_exc_format(env, error, "tcgetattr");

  // By default, the master tty will be in echo mode, which means that we will
  // get what we write back when we read from it. The stream is also line
  // buffered by default. Making it raw prevents all this.
  // see: man cfmakeraw
  cfmakeraw(&configuration);

  error = tcsetattr(master_fd.get(), 0, &configuration);
  if (error)
    _throw_exc_format(env, error, "tcsetattr");

  // see: man ptmx
  error = ptsname_r(master_fd.get(), slave_name, SLAVE_NAME_MAX_SIZE);
  if (error)
    _throw_exc_format(env, error, "ptsname_r");
  error = grantpt(master_fd.get());
  if (error)
    _throw_exc_format(env, error, "grantpt");
  error = unlockpt(master_fd.get());
  if (error)
    _throw_exc_format(env, error, "unlockpt");

  // We release master_fd for the scoped_fd wrapper to not actually close it,
  // as we want to send it to the running JS scripts.
  Napi::Object terminal = Napi::Object::New(env);
  terminal.Set("master_fd", master_fd.release());
  terminal.Set("slave_name", slave_name);
  return terminal;
#endif
}

static Napi::Object initialize(Napi::Env env, Napi::Object exports) {
  exports.Set("create_pty", Napi::Function::New(env, create_pty));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, initialize);
