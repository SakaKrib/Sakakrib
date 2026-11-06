package com.sakakrib.app;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.LocationSettingsResponse;
import com.google.android.gms.location.Priority;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.tasks.Task;

/**
 * Shows Android's native "Turn on device location" resolution dialog when GPS/location
 * services are disabled. The app must request runtime location permission separately.
 */
@CapacitorPlugin(name = "LocationSettings")
public class LocationSettingsPlugin extends Plugin {
    private static final int REQUEST_ENABLE_LOCATION = 7142;
    private PluginCall pendingCall;

    @PluginMethod
    public void ensureEnabled(PluginCall call) {
        LocationRequest request = new LocationRequest.Builder(
                Priority.PRIORITY_HIGH_ACCURACY, 10000L
        ).build();

        LocationSettingsRequest settingsRequest = new LocationSettingsRequest.Builder()
                .addLocationRequest(request)
                .setAlwaysShow(true)
                .build();

        Task<LocationSettingsResponse> task =
                LocationServices.getSettingsClient(getContext()).checkLocationSettings(settingsRequest);

        task.addOnSuccessListener(response -> resolveEnabled(call));
        task.addOnFailureListener(error -> {
            if (error instanceof ResolvableApiException) {
                try {
                    pendingCall = call;
                    ((ResolvableApiException) error).startResolutionForResult(
                            getActivity(), REQUEST_ENABLE_LOCATION
                    );
                } catch (IntentSender.SendIntentException sendError) {
                    pendingCall = null;
                    call.reject("Android could not open the location enable prompt.", "LOCATION_PROMPT_FAILED");
                }
            } else {
                call.reject("Location services are unavailable on this device.", "LOCATION_SERVICES_UNAVAILABLE");
            }
        });
    }

    private void resolveEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", true);
        call.resolve(result);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_ENABLE_LOCATION || pendingCall == null) return;

        PluginCall call = pendingCall;
        pendingCall = null;
        if (resultCode == Activity.RESULT_OK) {
            resolveEnabled(call);
        } else {
            call.reject("Location is still turned off. Tap Enable location to try again.", "LOCATION_SERVICES_OFF");
        }
    }
}
