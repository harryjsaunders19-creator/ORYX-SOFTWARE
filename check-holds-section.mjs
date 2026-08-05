#!/usr/bin/env node
import { chromium } from 'playwright';

async function checkHolds() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    if (page.url() === 'http://localhost:3000/') {
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForTimeout(1500);
    }

    console.log('Searching for all sections on the page...\n');
    
    // Get all headings
    const headings = await page.locator('h1, h2, h3, h4').allTextContents();
    console.log('All headings found:');
    headings.forEach((h, i) => {
      console.log(`  ${i + 1}. ${h.trim()}`);
    });

    // Search for hold-related text
    console.log('\n\nSearching for "hold" references...');
    const bodyText = await page.textContent('body');
    const holdMatches = bodyText.match(/[^\n]*hold[^\n]*/gi);
    if (holdMatches) {
      console.log('Hold-related text found:');
      holdMatches.slice(0, 5).forEach(match => {
        console.log(`  - ${match.trim().substring(0, 80)}`);
      });
    } else {
      console.log('  No "hold" text found');
    }

    // Check for specific section patterns
    console.log('\n\nChecking section patterns...');
    const sections = [
      'Clients on Hold',
      'Client Holds',
      'Holds',
      'Site Visits',
      'Upcoming Meetings',
      'Overdue Jobs',
      'Schedule'
    ];

    for (const section of sections) {
      const count = await page.locator(`text="${section}"`).count();
      const caseInsensitive = await page.locator(`text=/${section}/i`).count();
      console.log(`  "${section}": ${count > 0 ? '✓ Found' : caseInsensitive > 0 ? '✓ Found (case)' : '✗ Not found'}`);
    }

    // Scroll through the page and capture sections
    console.log('\n\nScrolling through page sections...');
    await page.evaluate(() => window.scrollTo(0, 0));
    
    let lastHeight = 0;
    let scrolls = 0;
    while (scrolls < 5) {
      const currentHeight = await page.evaluate(() => window.pageYOffset);
      if (currentHeight === lastHeight && scrolls > 0) break;
      
      const visibleHeadings = await page.locator('h1, h2, h3, h4').filter({ hasText: /.+/ }).allTextContents();
      console.log(`\n  Scroll ${scrolls + 1} - Visible headings:`);
      visibleHeadings.forEach(h => console.log(`    - ${h.trim()}`));
      
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(300);
      lastHeight = currentHeight;
      scrolls++;
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

checkHolds();
