module.exports = {
    root : true,
    env  : {
        browser : true,
        es2021  : true,
    },
    extends: [
        "eslint:recommended",
    ],
    parserOptions: {
        sourceType  : "module",
        ecmaVersion : "latest",
    },
    settings: {
        "import/resolver": {
            alias: {
                map: [
                    ["@", "./src"],
                ],
            },
        },
    },
    globals: {
        "ARGV"              : "readonly",
        "Debugger"          : "readonly",
        "GIRepositoryGType" : "readonly",
        "globalThis"        : "readonly",
        "imports"           : "readonly",
        "Intl"              : "readonly",
        "log"               : "readonly",
        "logError"          : "readonly",
        "print"             : "readonly",
        "printerr"          : "readonly",

        "global"   : false,
        "debug"    : false,
        "_"        : false,
        "_C"       : false,
        "_N"       : false,
        "ngettext" : false
    },
    rules: {
        "array-element-newline"  : ["error", "consistent"],
        "function-paren-newline" : ["error", "consistent"],
        "space-in-parens"        : ["error", "always"],
        "func-names"             : ["error", "as-needed"],
        "semi"                   : ["error", "never"],
        // "no-underscore-dangle": ["warn"],
        "key-spacing"            : ["error", {
            align: {
                beforeColon : true,
                afterColon  : true,
                on          : "colon",
            },
        }],
        "no-multi-spaces" : ["error", { exceptions: { VariableDeclarator: true } }],
        "quotes"          : ["error", "double"],
        "max-len"         : ["error", { code: 150 }],
        // "camelcase": ["error", {
        //     ignoreImports: true, ignoreDestructuring: true, properties: "never", allow: ["__"],
        // }],
    },
    "overrides": [
        {
            "files": [
                "webextension/**/*.js",
                "src/shell/**/*.js",
                "src/extension.js",
                "src/prefs.js"
            ],
            "parserOptions": {
                "sourceType": "module"
            }
        }
    ],
    globals: {},
}
