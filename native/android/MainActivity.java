package com.sakakrib.app;

import android.os.Bundle;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

/**
 * Native WebView configuration for Saka Krib.
 *
 * The app is served from https://localhost while the Django API is hosted
 * on the configured HTTPS tunnel. Android treats the API cookies as
 * third-party cookies, so explicitly allow them for this WebView.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(getBridge().getWebView(), true);
        cookieManager.flush();
    }
}
