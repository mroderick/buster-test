var buster = require("../../lib/buster-test");
buster.promise = require("../../lib/buster-test/promise");

var testCase = buster.testCase("Sample test", {
    setUp: function () {
        this.a = 1;
    },

    "should pass simple assertion": function () {
        buster.assert(true);
    },

    "should fail when test throws": function () {
        throw new Error("Ooops!");
    },

    "should fail test": function () {
        buster.assert.equals("Something", "Other");
    },

    "look ma, I'm asynchronous": function () {
        var promise = buster.promise.create(function () {
            setTimeout(function () {
                promise.resolve();
            }, 1000);
        });

        return promise;
    },

    "look ma, I'm implicitly asynchronous": function (done) {
        setTimeout(function () {
            done();
        }, 2000);
    },

    "context": {
        "should be awesome": function () {
            buster.assert.equals(1, 1);
        },

        "inside here": {
            setUp: function () {
                this.a += 1;
            },

            "should do it more": function () {
                buster.assert.equals(2, this.a);
            }
        }
    }
});

var testCase2 = buster.testCase("Another test", {
    setUp: function (done) {
        setTimeout(function () {
            done();
        }, 1000);
    },

    "should pass simple assertion": function () {
        buster.assert(true);
    },

    "should fail when test throws": function () {
        throw new Error("Ooops!");
    },

    "should fail test": function () {
        buster.assert.equals("Something", "Other");
    },

    "some context": {
        setUp: function (done) {
            setTimeout(function() {
                done();
            }, 1400);
        },

        tearDown: function (done) {
            setTimeout(function() {
                done();
            }, 1000);
        },

        "some other nested test": function () {

        }
    }
});

var runner = buster.util.create(buster.testRunner);
runner.timeout = 1500;

var log = function (event) {
    return function () {
        sys.puts(ind() + event + " (" + arguments[0].name + ")");
    };
};

var indent = 0;

function ind() {
    var str = "";

    for (var i = 0; i < indent; ++i) {
        str += " ";
    }

    return str;
}

// runner.bind({}, {
//     "suite:start": log("suite:start"),

//     "context:start": function () {
//         log("context:start").apply(null, arguments);
//         indent = indent + 4;
//     },

//     "test:setUp": log("test:setUp"),
//     "test:tearDown": log("test:tearDown"),
//     "test:start": log("test:start"),
//     "test:success": log("test:success"),
//     "test:failure": log("test:failure"),
//     "test:error": log("test:error"),
//     "test:timeout": log("test:timeout"),

//     "context:end": function () {
//         indent -= 4;
//         log("context:end").apply(null, arguments);
//     },

//     "suite:end": log("suite:end")
// });

var reporter = buster.xUnitConsoleReporter.create(runner, { color: true, bright: true });
runner.runSuite([testCase, testCase2]);
//runner.run(testCase2);