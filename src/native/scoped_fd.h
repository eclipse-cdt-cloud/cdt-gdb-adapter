/*********************************************************************
 * Copyright (c) 2018 Ericsson and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *********************************************************************/
#include <unistd.h>

/**
 * Own a file descriptor, close it on scope exit.
 */
class scoped_fd {
public:
  explicit scoped_fd(int fd) : m_fd(fd) {}

  scoped_fd(const scoped_fd &other) = delete;
  scoped_fd &operator=(const scoped_fd &other) = delete;

  bool operator==(int other) { return m_fd == other; }

  ~scoped_fd() { close(); }

  void close() {
    if (m_fd >= 0) {
      ::close(m_fd);
      m_fd = -1;
    }
  }

  int release() {
    int fd(m_fd);
    m_fd = -1;
    return fd;
  }

  int get() const { return m_fd; }

private:
  int m_fd;
};
