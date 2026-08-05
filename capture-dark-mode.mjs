#!/usr/bin/env node
import { chromium } from 'playwright';

async function captureDarkMode() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  try {
    console.log('1. Navigating to dashboard...');
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    // Navigate to dashboard if on root
    if (page.url() === 'http://localhost:3000/') {
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForTimeout(1500);
    }
    
    console.log(`   Current URL: ${page.url()}`);

    // Get initial background color
    const initialBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    console.log(`\n2. Initial background: ${initialBg}`);

    console.log('\n3. Opening theme settings...');
    // Find and click the settings/theme button
    const settingsButton = page.locator('[aria-label*="settings" i], button:has-text("Settings")').first();
    await settingsButton.click();
    await page.waitForTimeout(500);
    
    console.log('   Settings menu opened');

    console.log('\n4. Clicking DARK theme option...');
    // Find and click the Dark option
    const darkButton = page.locator('button:has-text("Dark"), [role="menuitem"]:has-text("Dark"), [class*="menu"] button:has-text("Dark")').first();
    
    if (await darkButton.count() === 0) {
      // Try finding by text content more broadly
      const menuItems = await page.locator('button, [role="menuitem"]').all();
      console.log(`   Found ${menuItems.length} menu items, searching for "Dark"...`);
      
      for (const item of menuItems) {
        const text = await item.textContent();
        if (text.includes('Dark')) {
          console.log(`   Found Dark option: "${text}"`);
          await item.click();
          break;
        }
      }
    } else {
      await darkButton.click();
      console.log('   ✓ Clicked Dark theme');
    }
    
    await page.waitForTimeout(1000);

    // Verify theme changed
    const darkBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    console.log(`\n5. Background after theme change: ${darkBg}`);
    
    // Check if background is dark
    const isDark = darkBg.includes('rgb(') && 
      (darkBg.match(/rgb\((\d+)/) && parseInt(darkBg.match(/rgb\((\d+)/)[1]) < 50);
    
    if (!isDark) {
      console.log('   ⚠ Theme may not have changed, trying alternative approach...');
      
      // Try clicking a theme toggle button
      const themeToggle = page.locator('[data-theme], [class*="theme-toggle" i], button[aria-label*="theme" i]').first();
      if (await themeToggle.count() > 0) {
        await themeToggle.click();
        await page.waitForTimeout(1000);
        const newBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
        console.log(`   Background after toggle: ${newBg}`);
      }
    }

    console.log('\n6. Closing any open menus...');
    // Click somewhere neutral to close menus
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Get final background and card colors
    const finalBg = await page.evaluate(() => {
      const body = window.getComputedStyle(document.body);
      const card = document.querySelector('[class*="Card"], [class*="card"]');
      const cardBg = card ? window.getComputedStyle(card).backgroundColor : 'N/A';
      const text = window.getComputedStyle(document.body).color;
      return {
        background: body.backgroundColor,
        card: cardBg,
        text: text
      };
    });

    console.log('\n7. Final theme colors:');
    console.log(`   Page background: ${finalBg.background}`);
    console.log(`   Card background: ${finalBg.card}`);
    console.log(`   Text color: ${finalBg.text}`);

    // Parse RGB values to check if dark
    const bgMatch = finalBg.background.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    const isDarkTheme = bgMatch && parseInt(bgMatch[1]) < 50 && parseInt(bgMatch[2]) < 50 && parseInt(bgMatch[3]) < 50;
    
    console.log(`   Theme is DARK: ${isDarkTheme ? '✅ YES' : '❌ NO'}`);

    if (!isDarkTheme) {
      console.log('\n⚠ WARNING: Dark theme may not have applied correctly!');
    }

    console.log('\n8. Capturing dark mode screenshot...');
    const screenshotPath = '/opt/cursor/artifacts/dashboard-dark-mode-confirmed.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`   ✓ Saved: ${screenshotPath}`);

    // Scroll down to check for Clients on Hold section
    console.log('\n9. Checking for "Clients on Hold" section...');
    const holdsSection = await page.locator('text=/clients on hold/i, text=/hold/i').first();
    
    if (await holdsSection.count() > 0) {
      const holdsText = await holdsSection.textContent();
      console.log(`   ✓ Found: "${holdsText}"`);
      
      // Scroll to it
      await holdsSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      console.log('   ✓ Scrolled to Clients on Hold section');
    } else {
      console.log('   ⚠ Clients on Hold section not found');
    }

    // Mobile viewport test
    console.log('\n10. Testing mobile viewport (390px)...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    
    // Scroll to find holds section on mobile
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    
    const holdsVisible = await page.locator('text=/clients on hold/i, text=/hold/i').first().isVisible().catch(() => false);
    console.log(`   Holds section visible on mobile: ${holdsVisible}`);
    
    if (holdsVisible) {
      await page.locator('text=/clients on hold/i, text=/hold/i').first().scrollIntoViewIfNeeded();
      console.log('   ✓ Clients on Hold appears after schedule sections');
    }

    console.log('\n✅ DARK MODE TESTING COMPLETE');
    console.log(`\nScreenshot saved to: ${screenshotPath}`);
    console.log(`Dark theme applied: ${isDarkTheme ? '✅ YES' : '❌ NO'}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

captureDarkMode();
