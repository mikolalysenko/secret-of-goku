import {defineConfig} from '@playwright/test';
import base from './playwright.config.mjs';
export default defineConfig(base,{
 testMatch:'mobile-player.spec.mjs',
 outputDir:'.local/mobile-test-results',
 use:{...base.use,channel:undefined,hasTouch:true,isMobile:true,viewport:{width:390,height:640}},
 projects:[
  {name:'mobile-chromium',use:{browserName:'chromium',channel:process.env.CI?'chromium':'chrome'}},
  {name:'mobile-webkit',use:{browserName:'webkit'}},
 ],
});
