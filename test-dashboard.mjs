#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const artifactsDir = '/opt/cursor/artifacts';
const fallbackDir = '/tmp/dashboard-screenshots';

async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true });
    return dir;
  } catch (err) {
    console.log(`Could not create ${dir}, trying fallback...`);
    await mkdir(fallbackDir, { recursive: true });
    return fallbackDir;
  }
}

async function testDashboard() {
  const screenshotDir = await ensureDir(artifactsDir);
  console.log(`Screenshots will be saved to: ${screenshotDir}`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  try {
    // Step 1: Navigate to login
    console.log('\n1. Navigating to http://localhost:3000/login');
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');

    // Step 2: Login - try with new password first (in case it was already changed)
    console.log('2. Logging in with admin@test.com / TestPass123!');
    await page.fill('input[type="email"], input[name="email"], input[id*="email"]', 'admin@test.com');
    await page.fill('input[type="password"], input[name="password"], input[id*="password"]', 'TestPass123!');
    await page.click('button[type="submit"], button:has-text("SIGN IN")');
    
    await page.waitForTimeout(3000);
    
    // Step 3: Check current URL
    let currentUrl = page.url();
    console.log(`Current URL after first login attempt: ${currentUrl}`);
    
    // If still on login, try original password
    if (currentUrl.includes('/login')) {
      console.log('   Trying original password: admin123');
      await page.fill('input[type="email"], input[name="email"], input[id*="email"]', 'admin@test.com');
      await page.fill('input[type="password"], input[name="password"], input[id*="password"]', 'admin123');
      await page.click('button[type="submit"], button:has-text("SIGN IN")');
      await page.waitForTimeout(3000);
      currentUrl = page.url();
      console.log(`Current URL after second login attempt: ${currentUrl}`);
    }

    // Check for password change requirement
    
    if (currentUrl.includes('/set-password') || currentUrl.includes('/change-password')) {
      console.log('3. Password change required - setting new password to TestPass123!');
      const newPassFields = await page.locator('input[type="password"]').all();
      if (newPassFields.length >= 2) {
        await newPassFields[0].fill('TestPass123!');
        await newPassFields[1].fill('TestPass123!');
      } else {
        await page.fill('input[name="newPassword"], input[id*="new"]', 'TestPass123!');
        await page.fill('input[name="confirmPassword"], input[id*="confirm"]', 'TestPass123!');
      }
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
    }

    // Step 4: Navigate to dashboard
    console.log('4. Navigating to /dashboard');
    let finalUrl = page.url();
    console.log(`   Current location: ${finalUrl}`);
    
    // Check if we're already logged in (root or dashboard)
    if (finalUrl === 'http://localhost:3000/' || finalUrl.includes('/dashboard')) {
      console.log('   ✓ Already logged in!');
      
      // If on root, navigate to dashboard
      if (finalUrl === 'http://localhost:3000/') {
        console.log('   Navigating from root to /dashboard');
        await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(1500);
      }
    } else if (finalUrl.includes('/login')) {
      console.log('   ❌ Still on login page, cannot proceed');
      throw new Error('Login failed');
    }
    
    finalUrl = page.url();
    console.log(`   Final URL: ${finalUrl}`);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Step 5: Screenshot light mode
    console.log('5. Capturing LIGHT MODE dashboard screenshot');
    const lightPath = join(screenshotDir, 'dashboard-light-mode.png');
    await page.screenshot({ path: lightPath, fullPage: false });
    console.log(`✓ Saved: ${lightPath}`);

    // Step 6: Analyze dashboard content
    console.log('\n6. Analyzing dashboard content:');
    
    // Get greeting text
    const greetingText = await page.locator('h1, h2, [class*="greeting"]').first().textContent().catch(() => 'Not found');
    console.log(`   - Greeting: ${greetingText}`);
    
    // Get KPI card values
    const kpiCards = await page.locator('[class*="card"], [class*="Card"]').all();
    console.log(`   - KPI cards found: ${kpiCards.length}`);
    
    const kpiValues = await page.locator('[class*="card"] [class*="text"], [class*="Card"] h2, [class*="Card"] h3').allTextContents();
    console.log(`   - KPI values: ${kpiValues.slice(0, 10).join(', ')}`);
    
    // Check for "00" vs "0"
    const hasDoubleZero = kpiValues.some(v => v.trim() === '00');
    console.log(`   - Shows "00" instead of "0": ${hasDoubleZero ? '❌ YES (bad)' : '✓ NO (good)'}`);

    // Step 7: Toggle dark mode
    console.log('\n7. Toggling DARK MODE');
    
    // Try to find theme toggle - common locations
    const themeToggleSelectors = [
      'button[aria-label*="theme" i]',
      'button[aria-label*="dark" i]',
      'button:has-text("Dark")',
      'button:has-text("Light")',
      '[class*="theme"] button',
      '[data-theme-toggle]',
      'button[class*="Theme"]',
      'svg[class*="moon"]',
      'svg[class*="sun"]'
    ];
    
    let themeToggled = false;
    for (const selector of themeToggleSelectors) {
      const toggle = page.locator(selector).first();
      if (await toggle.count() > 0) {
        console.log(`   Found theme toggle: ${selector}`);
        await toggle.click();
        await page.waitForTimeout(500);
        themeToggled = true;
        break;
      }
    }
    
    if (!themeToggled) {
      // Try settings/gear icon
      const settingsSelectors = ['button:has-text("Settings")', '[aria-label*="settings" i]', 'button[class*="Settings"]', 'svg[class*="gear"]'];
      for (const selector of settingsSelectors) {
        if (await page.locator(selector).count() > 0) {
          console.log(`   Opening settings menu: ${selector}`);
          await page.locator(selector).click();
          await page.waitForTimeout(300);
          
          // Try to find theme option in menu
          const themeOption = page.locator('[class*="theme"], [class*="Theme"], button:has-text("Dark"), button:has-text("Light")').first();
          if (await themeOption.count() > 0) {
            await themeOption.click();
            await page.waitForTimeout(500);
            themeToggled = true;
            break;
          }
        }
      }
    }
    
    if (!themeToggled) {
      console.log('   ⚠ Could not find theme toggle automatically');
    } else {
      console.log('   ✓ Dark mode toggled');
    }

    // Step 8: Screenshot dark mode
    console.log('8. Capturing DARK MODE dashboard screenshot');
    const darkPath = join(screenshotDir, 'dashboard-dark-mode.png');
    await page.screenshot({ path: darkPath, fullPage: false });
    console.log(`✓ Saved: ${darkPath}`);

    // Step 9: Check meeting card styling
    console.log('\n9. Checking meeting card styling:');
    const meetingCards = await page.locator('[class*="meeting"], [class*="Meeting"]').all();
    console.log(`   - Meeting cards found: ${meetingCards.length}`);
    
    if (meetingCards.length > 0) {
      const cardBg = await meetingCards[0].evaluate(el => {
        const style = window.getComputedStyle(el);
        return { bg: style.backgroundColor, color: style.color };
      }).catch(() => ({ bg: 'unknown', color: 'unknown' }));
      console.log(`   - Card background: ${cardBg.bg}`);
      console.log(`   - Card text color: ${cardBg.color}`);
      const isBigBlackBlock = cardBg.bg.includes('rgb(0, 0, 0)') || cardBg.bg === 'black';
      console.log(`   - Big black block issue: ${isBigBlackBlock ? '❌ YES (bad)' : '✓ NO (good)'}`);
    }

    // Step 10: Check empty states
    console.log('\n10. Checking empty states:');
    const overdueSection = await page.locator('text=/overdue/i').count();
    const holdsSection = await page.locator('text=/holds?/i').count();
    const siteVisitsSection = await page.locator('text=/site visit/i').count();
    console.log(`   - Overdue section visible: ${overdueSection > 0}`);
    console.log(`   - Holds section visible: ${holdsSection > 0}`);
    console.log(`   - Site visits section visible: ${siteVisitsSection > 0}`);

    // Step 11: Mobile width test
    console.log('\n11. Testing mobile width (~390px):');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const mobilePath = join(screenshotDir, 'dashboard-mobile.png');
    await page.screenshot({ path: mobilePath, fullPage: false });
    console.log(`✓ Saved: ${mobilePath}`);
    
    // Check for horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    console.log(`   - Horizontal overflow: ${hasOverflow ? '❌ YES (bad)' : '✓ NO (good)'}`);

    console.log('\n✅ Dashboard testing complete!');
    console.log(`\nScreenshot paths:`);
    console.log(`  - Light mode: ${lightPath}`);
    console.log(`  - Dark mode: ${darkPath}`);
    console.log(`  - Mobile: ${mobilePath}`);

  } catch (error) {
    console.error('\n❌ Error during testing:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

testDashboard().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
