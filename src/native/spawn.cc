#include <napi.h>

#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <errno.h>
#include <libgen.h>
#include <sys/wait.h>
#include <sys/types.h>
#include <signal.h>


#ifndef PATH_MAX
#define PATH_MAX 1024
#endif

#define PATH_DEF "PATH="
const int path_def_len = 5; /* strlen(PATH_DEF); */

extern "C" {

char * path_val(char * const envp[])
{
	int i;
	if (envp == NULL || envp[0] == NULL)
		return getenv("PATH" );
	
	for(i = 0; envp[i] != NULL; i++){
		char* p = envp[i];
		if(!strncmp(PATH_DEF, p, path_def_len)){
			return p + path_def_len;
		}
	}
	
	return NULL;
}

char * pfind(const char *name, char * const envp[], char *errbuff)
{
	char *tok;
	char *sp;
	char *path;
	char fullpath[PATH_MAX+1];

	/* Sanity check.  */
	if (name == NULL) {
		sprintf(errbuff, "pfind(): Null argument.\n");
		return NULL;
	}

	/* For absolute name or name with a path, check if it is an executable.  */
	if (name[0] == '/' || name[0] == '.') {
		if (access(name, X_OK) == 0) {
			return strdup(name);
		}
		return NULL;
	}

	/* Search in the PATH environment.  */
	path = path_val( envp );

	if (path == NULL || strlen(path) <= 0) {
		sprintf(errbuff, "Unable to get $PATH.\n");
		return NULL;
	}

	/* The value return by getenv() is readonly */
	path = strdup(path);

	tok = strtok_r(path, ":", &sp);
	while (tok != NULL) {
		snprintf(fullpath, sizeof(fullpath) - 1, "%s/%s", tok, name);

		if (access(fullpath, X_OK) == 0) {
			free(path);
			return strdup(fullpath);
		}

		tok = strtok_r( NULL, ":", &sp );
	}

	free(path);
	return NULL;
}

pid_t exec0(const char *path, char *const argv[], char *const envp[], const char *dirpath, int channels[3], char *errbuff)
{
	int pipe0[2], pipe1[2], pipe2[2];
	pid_t childpid;
	char *full_path;

	/*
	 * We use pfind() to check that the program exists and is an executable.
	 * If not pass the error up.  Also execve() wants a full path.
	 */ 
    char pfind_errbuff[1024];
	full_path = pfind(path, envp, pfind_errbuff);
	if (full_path == NULL) {
		sprintf(errbuff, "Unable to find full path for \"%s\"\n%s\n", (path) ? path : "", pfind_errbuff);
		return -1;
	}

	/*
	 *  Make sure we can create our pipes before forking.
	 */ 
	if (channels != NULL) {
		if (pipe(pipe0) < 0 || pipe(pipe1) < 0 || pipe(pipe2) < 0) {
			sprintf(errbuff, "%s(%d): returning due to error.\n",
				__FUNCTION__, __LINE__);
			free(full_path);
			return -1;
		}
	}

	childpid = fork();

	if (childpid < 0) {
		sprintf(errbuff, "%s(%d): returning due to error: %s\n",
			__FUNCTION__, __LINE__, strerror(errno));
		free(full_path);
		return -1;
	} else if (childpid == 0) { /* child */
		char *ptr;

		chdir(dirpath);

		if (channels != NULL) {
			/* Close the write end of pipe0 */
			if (close(pipe0[1]) == -1)
				perror("close(pipe0[1])");

			/* Close the read end of pipe1 */
			if (close(pipe1[0]) == -1)
				perror("close(pipe1[0])");

			/* Close the read end of pipe2 */
			if (close(pipe2[0]) == -1)
				perror("close(pipe2[0]))");

			/* redirections */
			dup2(pipe0[0], STDIN_FILENO);   /* dup stdin */
			dup2(pipe1[1], STDOUT_FILENO);  /* dup stdout */
			dup2(pipe2[1], STDERR_FILENO);  /* dup stderr */
		}

		/* Close all the fd's in the child */
		{
			int fdlimit = sysconf(_SC_OPEN_MAX);
			int fd = 3;

			while (fd < fdlimit)
				close(fd++);
		}

		setpgid(getpid(), getpid());
        setsid();


		if (envp[0] == NULL) {
			execv(full_path, argv);
		} else {
			execve(full_path, argv, envp);
		}

		_exit(127);

	} else if (childpid != 0) { /* parent */

		char b;

		if (channels != NULL) {
			/* close the read end of pipe1 */
			if (close(pipe0[0]) == -1)
				perror("close(pipe0[0])");
 
			/* close the write end of pipe2 */
			if (close(pipe1[1]) == -1) 
				perror("close(pipe1[1])");

			/* close the write end of pipe2 */
			if (close(pipe2[1]) == -1) 
				perror("close(pipe2[1])");

			channels[0] = pipe0[1]; /* Output Stream. */
			channels[1] = pipe1[0]; /* Input Stream.  */
			channels[2] = pipe2[0]; /* Input Stream.  */
		}

		free(full_path);
		return childpid;
	}

	free(full_path);
	return -1;                  /*NOT REACHED */
}
}// extern "C"

namespace gdbSpawn
{

char **c_str_array(Napi::Array js_arr) {
    
    unsigned i;
    char **c_arr = (char **) malloc(sizeof(char *) * js_arr.Length() + 1);
    for (i=0; i< js_arr.Length(); i++) {
        std::string str = js_arr.Get(i).ToString().Utf8Value();
        c_arr[i] = strdup(str.c_str());
    }
    c_arr[js_arr.Length()] = NULL;
    return c_arr;
}

void free_c_str_array(char **arr) {
    if (arr) {
        char **p = arr;
        for (; *p; p++) {
            free(*p);
        }
        free(arr);
    }
}

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

//exec(args: string[], env: string[], dirpath: string) => {pid: number, stdin: number, stdout: number, stderr: number}
static Napi::Object exec_0(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    int pid;
    int channels[3];
// stuff

    if (info.Length() < 4) {
        _throw_exc(env, "Too few args passed to .exec_0()");
    }
    if(!info[0].IsArray() || !info[1].IsArray() || !info[2].IsString() || !info[3].IsFunction()) {
        _throw_exc(env, "Incorrect argument type. Use .exec_0(string, string[], string[], string, (string) => void)");
    }
    Napi::Function log = info[3].As<Napi::Function>();

    Napi::String dp = info[2].ToString();
    const char *dirpath = dp.Utf8Value().c_str();

    Napi::Array arg_arr = info[0].As<Napi::Array>();
    char **argv = c_str_array(arg_arr);
    Napi::Array env_arr = info[1].As<Napi::Array>();
    char **envp = c_str_array(env_arr);

    char errbuff[4096];
    pid = exec0(argv[0], argv, envp, dirpath, channels, errbuff);
    if (pid <= 0)
        log.Call({Napi::String::New(env, errbuff)});
    Napi::Object ret = Napi::Object::New(env);
    if (pid > 0) {
    ret.Set("pid", pid);
    ret.Set("stdin", channels[0]);
    ret.Set("stdout", channels[1]);
    ret.Set("stderr", channels[2]);
    } else {
        ret.Set("pid", pid);
        ret.Set("errmsg", Napi::String::New(env, errbuff));
    }

    free_c_str_array(argv);
    free_c_str_array(envp);

    return ret;
}

static Napi::Object initialize(Napi::Env env, Napi::Object exports)
{
    exports.Set("native_exec", Napi::Function::New(env, exec_0));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, initialize);
} // namespace gdbSpawn
