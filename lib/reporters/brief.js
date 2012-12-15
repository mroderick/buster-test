var colorizer = require("ansi-colorizer");

function getOutputStream(opt) {
    if (opt.outputStream) { return opt.outputStream; }
    var util = require("util");
    return {
        write: function (bytes) { util.print(bytes); }
    };
}

function getSummary(r) {
    var envs = r.environments.length;
    var tests = r.expectedTests && r.expectedTests + " " || "";
    var envLabel = envs === 1 ?
            "in 1 environment" : "across " + envs + " environments";
    return "Running " + tests + "tests " + envLabel + " ...";
}

function getProgress(r) {
    var percentage = Math.round(r.executedTests / r.expectedTests * 100);
    return isNaN(percentage) ? "" : percentage + "% done";
}

function getEnv(environments, event) {
    return environments.filter(function (env) {
        return env.uuid === event.environment.uuid;
    })[0];
}

function createEnv(env) {
    return {
        uuid: env.uuid,
        description: env.toString(),
        contexts: [],
        log: []
    };
}

function startContext(env, event) {
    env.contexts.push(event.name);
}

function endContext(env, event) {
    env.contexts.pop();
}

function startTest(env, event) {
    env.currentTest = event.name;
    env.log = [];
}

function endTest(env, event) {
    delete env.currentTest;
}

/**
 * Collect log messages with the test they originated from. If there's
 * no currently active test, return falsy to indicate the message
 * could not be added.
 */
function addLogMessage(env, event) {
    if (!env.currentTest) { return; }
    var msg = { level: event.level, message: event.message };
    env.log.push(msg);
    return msg;
}

function contextualName(env, event) {
    return env.contexts.concat(event.name).join(" ");
}

function filterStack(filter, error) {
    if (!filter) { return error.stack.split("\n"); }
    return filter.filter(error.stack);
}

function firstStackLine(error) {
    return error.stack && error.stack.split("\n")[0];
}

/**
 * Sometimes typos or other mistakes in central parts of the
 * implementation will cause many tests to fail for the same reason.
 * When this is the case, all the errors will have the same name and
 * message, and they will share the first line of the stack trace.
 *
 * Look through the list of errors to see if a new error is a repeat
 * occurrence of a previous error.
 */
function findSimilarError(errors, e) {
    // If there's no stack, we can't know for sure the error is a
    // repeat occurrence of a previous error.
    if (!e.stack) { return; }
    return errors.filter(function (err) {
        return err.name === e.name && err.message === e.message &&
            firstStackLine(err) === firstStackLine(e);
    })[0];
}

function saveError(errors, e, log) {
    errors.push({
        name: e.error.name,
        message: e.error.message,
        stack: e.error.stack || "",
        occurrences: [{ name: e.name, log: log }]
    });
}

function pluralize(count, label) {
    return count + " " + (count === 1 ? label : label + "s");
}

function formatMessage(msg) {
    return "[" + msg.level.toUpperCase() + "] " + msg.message;
}

function formatMessages(messages) {
    return "    " + (messages || []).map(formatMessage).join("\n    ");
}

function formatStack(error, stackFilter, options) {
    options = options || {};
    var name = error.name;
    name = name && name !== "AssertionError" ? name + ": " : "";

    var out = "  " + name + error.message + "\n";

    // Explicit check against false because undefined/non-existent
    // should default to true.
    if (options.includeSource !== false && error.source) {
        out += "  -> " + error.source + "\n";
    }

    var stack = filterStack(stackFilter, error);

    if (options.stackLines) {
        stack = stack.slice(0, options.stackLines);
    }

    return out + "    " + stack.join("\n      ") + "\n";
}

function formatSimilarErrors(errors, stackFilter) {
    return errors.reduce(function (out, error) {
        return out + error.occurrences.map(function (test) {
            var msg = "  " + test.name;
            if (test.log.length > 0) {
                msg += "\n" + formatMessages(test.log);
            }
            return msg;
        }).join("\n") + "\n\n" + formatStack(error, stackFilter, {
            includeSource: false,
            stackLines: 1
        });
    }, "Repeated exceptions:\n");
}

function formatSummary(reporter) {
    return getSummary(reporter) + " " + getProgress(reporter) + "\n";
}

function summarizeErrors(e) {
    var details = [];
    if (e.failures > 0) {
        details.push(pluralize(e.failures, "failure"));
    }
    if (e.errors > 0) {
        details.push(pluralize(e.errors, "error"));
    }
    if (e.timeouts > 0) {
        details.push(pluralize(e.timeouts, "timeout"));
    }
    return details.join(", ");
}

function reportException(reporter, e, label) {
    reporter.executedTests += 1;
    var env = getEnv(reporter.environments, e);
    reporter.clearStatus();
    reporter.writeln(label + contextualName(env, e) + " (" + env.description + ")");

    if (env.log.length > 0) {
        reporter.writeln(formatMessages(env.log));
    }

    if (e.error) {
        reporter.write(formatStack(e.error, reporter.stackFilter));
    }

    reporter.writeln(getSummary(reporter) + " " + getProgress(reporter));
}

function BriefReporter(opt) {
    this.out = getOutputStream(opt);
    this.color = colorizer.configure(opt);
    this.cwd = opt.cwd;
    this.stackFilter = opt.stackFilter;
    this.environments = [];
    this.expectedTests = 0;
    this.executedTests = 0;
    this.errors = [];
    var v = opt.verbosity;
    this.verbose = v === "info" || v === "debug";
    this.vverbose = v === "debug";
}

BriefReporter.prototype = module.exports = {
    create: function (opt) {
        return new BriefReporter(opt || {});
    },

    listen: function (runner) {
        runner.bind(this);
        if (runner.console) { runner.console.on("log", this.log, this); }
        return this;
    },

    "suite:start": function () {
        this.writeln("Running tests ...");
        this.summaryTimer = setTimeout(this.printProgress.bind(this), 250);
    },

    "suite:configuration": function (e) {
        this.environments.push(createEnv(e.environment));
        this.expectedTests += e.tests || 0;
        this.clearStatus();
        if (this.verbose) {
            this.writeln("-> " + e.environment.description);
        }
        this.writeln(getSummary(this));
    },

    "context:start": function (e) {
        startContext(getEnv(this.environments, e), e);
    },

    "context:end": function (e) {
        endContext(getEnv(this.environments, e), e);
    },

    "context:unsupported": function (e) {
        if (!this.verbose) { return; }
        this.clearStatus();
        var env = getEnv(this.environments, e);
        var name = contextualName(env, e.context);
        var ua = env.description;
        this.writeln("Skipping unsupported context " + name + " (" + ua + ")");
        this.writeln("    " + e.unsupported.join("\n    "));
        this.write(formatSummary(this));
    },

    log: function (e) {
        if (!addLogMessage(getEnv(this.environments, e), e)) {
            this.clearStatus();
            this.write(
                formatMessage(e) + " (" + e.environment.description + ")\n" +
                    formatSummary(this)
            );
        }
    },

    "test:setUp": function (e) {
        startTest(getEnv(this.environments, e), e);
    },

    "test:tearDown": function (e) {
        endTest(getEnv(this.environments, e), e);
    },

    "test:success": function (e) {
        this.executedTests += 1;
        var env = getEnv(this.environments, e);
        if (!this.vverbose || env.log.length === 0) { return; }
        this.clearStatus();
        this.writeln(contextualName(env, e));
        this.writeln(formatMessages(env.log));
        this.write(formatSummary(this));
    },

    "test:failure": function (e) {
        reportException(this, e, "Failure: ");
    },

    "test:error": function (e) {
        var err = findSimilarError(this.errors, e.error);
        var log = getEnv(this.environments, e).log;
        if (err) {
            return err.occurrences.push({ name: e.name, log: log });
        }
        saveError(this.errors, e, log);
        reportException(this, e, "Error: ");
    },

    "test:timeout": function (e) {
        reportException(this, e, "Timeout: ");
    },

    "test:deferred": function (e) {
        if (!this.verbose) { return; }
        this.clearStatus();
        var env = getEnv(this.environments, e);
        this.writeln("Deferred: " + contextualName(env, e) + " (" + env.description + ")");
        if (e.comment) { this.writeln("          " + e.comment); }
        this.write(formatSummary(this));
    },

    "uncaughtException": function (e) {
        var ua = e.environment.description;
        this.clearStatus();
        this.writeln("Uncaught exception in " + ua + ":\n");
        this.write(formatStack(e, this.stackFilter));
        this.write(formatSummary(this));
    },

    "suite:end": function (e) {
        clearTimeout(this.summaryTimer);
        this.clearStatus();

        if (this.errors.length > 0) {
            this.write("\n" + formatSimilarErrors(this.errors, this.stackFilter));
        }

        this.write(pluralize(e.tests, "test") + ", " +
                   pluralize(e.assertions, "assertion") + ", " +
                   pluralize(this.environments.length, "environment") +
                   " ... ");

        if (e.ok) {
            this.writeln("OK");
        } else {
            this.writeln(summarizeErrors(e));
        }

        if (e.deferred > 0) {
            this.write(pluralize(e.deferred, "deferred test"));
        }

        if (this.verbose && e.assertions === 0) {
            this.writeln("WARNING: No assertions!");
        }
    },

    printProgress: function () {
        this.clearStatus();
        this.write(formatSummary(this));
        this.summaryTimer = setTimeout(this.printProgress.bind(this), 100);
    },

    write: function (str) {
        this.out.write(str);
    },

    writeln: function (str) {
        this.out.write(str + "\n");
    },

    clearStatus: function () {
        this.write("\x1b[1A\x1b[K");
    }
};