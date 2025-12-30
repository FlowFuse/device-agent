import globals from 'globals'
import js from '@eslint/js'
import neostandard, { resolveIgnoresFromGitignore } from 'neostandard'
import stylistic from '@stylistic/eslint-plugin'
import noOnlyTests from 'eslint-plugin-no-only-tests'

export default [
    {
        files: ['**/*.js'],
        languageOptions: {
            globals: {
                ...globals.browser
            },
            sourceType: 'script'
        }
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.mocha
            },
            sourceType: 'script'
        }
    },
    {
        ignores: [
            ...resolveIgnoresFromGitignore()
        ]
    },
    js.configs.recommended,
    ...neostandard(),
    {
        plugins: {
            '@stylistic': stylistic,
            'no-only-tests': noOnlyTests
        },
        rules: {
            // built-in
            'object-shorthand': ['error'],
            'no-console': ['error', { allow: ['debug', 'info', 'warn', 'error'] }],

            // plugin:stylistic
            '@stylistic/indent': ['warn', 4], // https://eslint.style/rules/indent#options
            '@stylistic/spaced-comment': ['error', 'always'], // https://eslint.style/rules/spaced-comment
            '@stylistic/no-multi-spaces': 'error', // https://eslint.style/rules/no-multi-spaces#no-multi-spaces
            '@stylistic/comma-dangle': ['error', 'never'], // https://eslint.style/rules/comma-dangle#comma-dangle

            // plugin:no-only-tests
            'no-only-tests/no-only-tests': 'error'
        }
    }
]
