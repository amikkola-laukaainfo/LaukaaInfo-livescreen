const Terser = require('terser');
async function test() {
  const code1 = 'var SUPABASE_URL = "https://example.com"; var SUPABASE_ANON_KEY = "abc"; var supabaseClient = null;';
  const res1 = await Terser.minify(code1, {
    compress: { drop_console: true, drop_debugger: true, passes: 2 },
    mangle: { toplevel: false },
    output: { comments: false }
  });
  console.log('Result for var:', res1.code);

  const code2 = 'const SUPABASE_URL = "https://example.com"; const SUPABASE_ANON_KEY = "abc"; let supabaseClient = null;';
  const res2 = await Terser.minify(code2, {
    compress: { drop_console: true, drop_debugger: true, passes: 2 },
    mangle: { toplevel: false },
    output: { comments: false }
  });
  console.log('Result for const:', res2.code);
}
test();
