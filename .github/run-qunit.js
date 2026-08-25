"use strict";
const puppeteer = require( "puppeteer-core" );
const url = process.argv[ 2 ];
const timeoutMs = parseInt( process.env.QUNIT_TIMEOUT_MS || "1500000", 10 );

// Read QUnit's DOM report rather than hooking its callbacks: the suite reloads
// itself into iframes, and the report is what QUnit 1.14 keeps stable.
function scrape() {
  const items = document.querySelectorAll( "#qunit-tests > li" );
  const tests = [];
  for ( let i = 0; i < items.length; i++ ) {
    const li = items[ i ];
    const strong = li.querySelector( "strong" );
    tests.push( {
      state: li.className,
      name: ( strong ? strong.textContent : "(unnamed)" ).replace( /\s+/g, " " ).trim(),
      detail: li.className === "fail" ?
        li.textContent.replace( /\s+/g, " " ).trim().slice( 0, 1500 ) : ""
    } );
  }
  const res = document.getElementById( "qunit-testresult" );
  const text = res ? res.textContent.replace( /\s+/g, " " ).trim() : "";
  return { tests: tests, done: /Tests completed/.test( text ) ? text : null };
}

async function main() {
  const browser = await puppeteer.launch( {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: [ "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
      "--window-size=1280,1024" ]
  } );
  const page = await browser.newPage();
  await page.setViewport( { width: 1280, height: 1024 } );
  page.on( "pageerror", function( err ) { console.log( "[pageerror] " + err.message ); } );
  console.log( "Running jQuery QUnit suite in headless Chrome: " + url );
  await page.goto( url, { waitUntil: "domcontentloaded", timeout: 180000 } );

  let reported = 0, failed = 0, state = null;
  const start = Date.now();
  while ( Date.now() - start < timeoutMs ) {
    state = await page.evaluate( scrape );
    // Only emit finished tests; an in-flight one carries class "running".
    while ( reported < state.tests.length ) {
      const t = state.tests[ reported ];
      if ( t.state !== "pass" && t.state !== "fail" ) { break; }
      reported++;
      if ( t.state === "fail" ) {
        failed++;
        console.log( "not ok " + reported + " - " + t.name );
        console.log( "  --- " + t.detail );
      } else {
        console.log( "ok " + reported + " - " + t.name );
      }
    }
    if ( state.done ) { break; }
    await new Promise( function( r ) { setTimeout( r, 2000 ); } );
  }
  await browser.close();

  if ( !state || !state.done ) {
    console.log( "# QUnit suite did not finish within " + timeoutMs + "ms (" +
      reported + " tests reported)" );
    process.exit( 1 );
  }
  console.log( "1.." + reported );
  console.log( "# tests " + reported );
  console.log( "# pass  " + ( reported - failed ) );
  console.log( "# fail  " + failed );
  console.log( "# " + state.done );
  const m = /(\d+) failed/.exec( state.done );
  process.exit( failed > 0 || ( m && parseInt( m[ 1 ], 10 ) > 0 ) ? 1 : 0 );
}

main().catch( function( err ) {
  console.error( ( err && err.stack ) || err );
  process.exit( 1 );
} );
