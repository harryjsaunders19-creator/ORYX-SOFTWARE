#!/usr/bin/env node
import { chromium } from 'playwright';

async function analyzeDashboard() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  try {
    // Login
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    // Navigate to dashboard (might be on root)
    if (page.url() === 'http://localhost:3000/') {
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForTimeout(1500);
    }

    console.log('\n=== DETAILED DASHBOARD ANALYSIS ===\n');

    // 1. Greeting text
    const greeting = await page.locator('h1, h2').first().textContent();
    console.log('1. GREETING TEXT:');
    console.log(`   "${greeting}"`);

    // 2. KPI Cards
    console.log('\n2. KPI CARDS:');
    const kpiCards = await page.locator('[class*="Card"], [class*="card"]').all();
    for (let i = 0; i < Math.min(kpiCards.length, 6); i++) {
      const text = await kpiCards[i].textContent();
      const cleanText = text.replace(/\s+/g, ' ').trim();
      console.log(`   Card ${i + 1}: ${cleanText.substring(0, 80)}`);
    }

    // 3. Check for "0" vs "00"
    console.log('\n3. NUMBER FORMATTING:');
    const allText = await page.textContent('body');
    const hasDoubleZero = /\b00\b/.test(allText) && !allText.includes('2000') && !allText.includes('3000');
    console.log(`   Contains "00" (bad): ${hasDoubleZero ? '❌ YES' : '✓ NO'}`);
    
    // Find all numbers displayed
    const numberElements = await page.locator('[class*="text"], h1, h2, h3, h4, p, span').allTextContents();
    const singleDigitZeros = numberElements.filter(t => t.trim() === '0').length;
    const doubleDigitZeros = numberElements.filter(t => t.trim() === '00').length;
    console.log(`   Single "0" count: ${singleDigitZeros}`);
    console.log(`   Double "00" count: ${doubleDigitZeros}`);

    // 4. Meeting card styling
    console.log('\n4. MEETING CARD STYLING:');
    const meetingCard = await page.locator('[class*="meeting" i], [class*="Meeting"]').first();
    if (await meetingCard.count() > 0) {
      const styles = await meetingCard.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          padding: computed.padding,
          borderRadius: computed.borderRadius,
          display: computed.display
        };
      });
      console.log(`   Background: ${styles.backgroundColor}`);
      console.log(`   Text color: ${styles.color}`);
      console.log(`   Padding: ${styles.padding}`);
      console.log(`   Is big black block: ${styles.backgroundColor === 'rgb(0, 0, 0)' || styles.backgroundColor === 'black' ? '❌ YES' : '✓ NO'}`);
    } else {
      console.log('   ⚠ No meeting cards found');
    }

    // 5. Empty states
    console.log('\n5. EMPTY STATES:');
    const sections = {
      'Overdue': await page.locator('text=/overdue/i').count(),
      'Holds': await page.locator('text=/hold/i').count(),
      'Site Visits': await page.locator('text=/site visit/i').count()
    };
    
    for (const [name, count] of Object.entries(sections)) {
      console.log(`   ${name}: ${count > 0 ? '✓ Visible' : '❌ Not found'}`);
    }

    // Check for empty state messages
    const emptyMessages = await page.locator('[class*="empty" i], [class*="Empty"]').allTextContents();
    if (emptyMessages.length > 0) {
      console.log(`\n   Empty state messages found:`);
      emptyMessages.slice(0, 3).forEach(msg => {
        console.log(`     - ${msg.trim().substring(0, 60)}`);
      });
    }

    // 6. Check current theme
    console.log('\n6. THEME DETECTION:');
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    const isDark = bgColor.includes('rgb(') && 
      (bgColor.includes('rgb(0') || bgColor.includes('rgb(1') || bgColor.includes('rgb(2'));
    console.log(`   Background color: ${bgColor}`);
    console.log(`   Current theme: ${isDark ? 'DARK' : 'LIGHT'}`);

    // 7. Layout check
    console.log('\n7. LAYOUT:');
    const hasScroll = await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight
    }));
    console.log(`   Horizontal overflow: ${hasScroll.horizontal ? '❌ YES' : '✓ NO'}`);
    console.log(`   Vertical scroll: ${hasScroll.vertical ? '✓ YES (normal)' : 'NO'}`);

    // 8. Specific UI elements
    console.log('\n8. UI ELEMENTS:');
    const elements = {
      'Header/Nav': await page.locator('header, nav').count(),
      'KPI Cards': await page.locator('[class*="Card"], [class*="card"]').count(),
      'Charts/Graphs': await page.locator('canvas, svg[class*="chart" i]').count(),
      'Tables': await page.locator('table, [role="table"]').count(),
      'Buttons': await page.locator('button').count()
    };
    
    for (const [name, count] of Object.entries(elements)) {
      console.log(`   ${name}: ${count}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

analyzeDashboard();
