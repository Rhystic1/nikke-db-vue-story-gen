/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution')

module.exports = {
  root: true,
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
    '@vue/eslint-config-typescript',
    '@vue/eslint-config-prettier/skip-formatting'
  ],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  overrides: [
    {
      files: ['src/components/**/*.{js,ts,vue}', 'src/utils/**/*.{js,ts,vue}'],
      excludedFiles: [
        'src/utils/storyProviders.ts',
        'src/utils/llmUtils.ts',
        'src/utils/geminiUtils.ts',
        'src/utils/pollinationsUtils.ts',
        'src/**/*.spec.ts'
      ],
      rules: {
        'no-restricted-imports': ['error', {
          paths: [
            {
              name: '@/utils/llmUtils',
              importNames: [
                'callOpenCodeGo',
                'callOpenCodeGoSummarization',
                'fetchOpenCodeGoModels',
                'callGemini',
                'callOpenRouter',
                'callPollinations',
                'callLocal',
                'callZai',
                'fetchGeminiModels',
                'fetchOpenRouterModels',
                'fetchPollinationsModels'
              ],
              message: 'Call runStoryProvider or listStoryModels.'
            },
            {
              name: '@/utils/geminiUtils',
              importNames: ['callGemini', 'fetchGeminiModels'],
              message: 'Call runStoryProvider or listStoryModels.'
            },
            {
              name: '@/utils/pollinationsUtils',
              importNames: ['callPollinations', 'fetchPollinationsModels'],
              message: 'Call runStoryProvider or listStoryModels.'
            }
          ]
        }]
      }
    }
  ],
  rules: {
    '@typescript-eslint/type-annotation-spacing': 'error',
    'arrow-parens': ['error', 'always'],
    'arrow-spacing': ['error', {
      'before': true, 'after': true
    }],
    'comma-spacing': ['error', {
      'before': false, 'after': true
    }],
    'block-spacing': ['error', 'always'],
    'default-case': 'error',
    'default-case-last': 'error',
    'default-param-last': 'error',
    'eqeqeq': 'error',
    'func-call-spacing': ['error', 'never'],
    'indent': [ 'error', 2, {
      'SwitchCase': 1
    } ],
    'keyword-spacing': ['error', {
      'after': true, 'before': true,
    }],
    // 'no-trailing-spaces': 'error',
    'no-unreachable': 'error',
    'no-unreachable-loop': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    'no-var': 'error',
    'object-curly-spacing': ['error', 'always'],
    'quotes': [ 'error', 'single' ],
    'semi': [ 'error', 'never' ],
    'space-infix-ops': 'error',
    'switch-colon-spacing': ['error', {
      'after': true, 'before': false
    }],
    'vue/multi-word-component-names': 'off',
    'yoda': 'error',
  }
}
