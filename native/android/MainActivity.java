package com.sakakrib.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

import com.sakakrib.app.LocationSettingsPlugin;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

/**
 * Native WebView and social-login configuration for Saka Krib.
 *
 * Google login requests the email/profile scopes. Capgo Social Login needs
 * Android activity results forwarded to its plugin when scopes are supplied.
 *
 * The app is served from https://localhost while the Django API is hosted
 * on the configured HTTPS tunnel. Android treats the API cookies as
 * third-party cookies, so explicitly allow them for this WebView.
 */
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocationSettingsPlugin.class);
        super.onCreate(savedInstanceState);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(getBridge().getWebView(), true);
        cookieManager.flush();
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.i("Google Activity Result", "SocialLogin plugin handle is null");
                return;
            }

            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.i("Google Activity Result", "SocialLogin plugin instance is not SocialLoginPlugin");
                return;
            }

            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        Uri data = intent.getData();
        if (Intent.ACTION_VIEW.equals(intent.getAction())
                && data != null
                && "com.sakakrib.app".equals(data.getScheme())
                && "apple-login".equals(data.getHost())) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle != null) {
                Plugin plugin = pluginHandle.getInstance();
                if (plugin instanceof SocialLoginPlugin) {
                    ((SocialLoginPlugin) plugin).handleAppleLoginIntent(intent);
                    return;
                }
            }
        }

        super.onNewIntent(intent);
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Required marker method for Capgo Social Login's Android activity-result handling.
    }
}
