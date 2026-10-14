# R8 keep rules.
#
# Everything here exists because Capacitor finds code by reflection rather than
# by call site, and R8 only keeps what it can see being used. Without these the
# release build compiles, installs, launches, and then every native call fails
# at runtime with a plugin-not-found — a class of bug that never appears in a
# debug build and so tends to be discovered by a user.

# The bridge, and anything the web view reaches through it.
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }

# Plugins are discovered by annotation and their methods invoked by name.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}

# Any method the web view can call directly. Renaming one silently breaks it.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Cordova plugins bridged through Capacitor, if any are ever added.
-keep class org.apache.cordova.** { *; }

# ML Kit loads its barcode models through an optional, dynamically delivered
# module. Stripping these turns scanning into a silent no-op.
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_** { *; }
-dontwarn com.google.mlkit.**

# Plugin configuration and JSON payloads cross the bridge as reflected fields.
-keepclassmembers class * {
    @com.getcapacitor.annotation.** <fields>;
}

# Keep source line numbers so a crash report from a gym is readable, while
# still renaming the file itself.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
