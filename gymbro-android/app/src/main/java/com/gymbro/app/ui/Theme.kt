package com.gymbro.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Palette carried over from the original GymBro design: near-black + orange. */
object GymBroColors {
    val Ink950 = Color(0xFF08080A)
    val Ink900 = Color(0xFF0E0E11)
    val Ink850 = Color(0xFF141418)
    val Ink800 = Color(0xFF1B1B20)
    val Ink750 = Color(0xFF232329)
    val Ink700 = Color(0xFF2C2C34)
    val Ink600 = Color(0xFF3F3F49)
    val Ink500 = Color(0xFF5A5A66)
    val Ink400 = Color(0xFF8A8A99)
    val Ink300 = Color(0xFFB4B4C0)
    val Ink200 = Color(0xFFD8D8E0)
    val Flame300 = Color(0xFFFDBA74)
    val Flame400 = Color(0xFFFB923C)
    val Flame500 = Color(0xFFF97316)
    val Flame600 = Color(0xFFEA580C)
    val Volt = Color(0xFFFACC15)
}

private val GymBroScheme = darkColorScheme(
    primary = GymBroColors.Flame500,
    onPrimary = GymBroColors.Ink950,
    primaryContainer = GymBroColors.Flame600,
    onPrimaryContainer = GymBroColors.Ink950,
    secondary = GymBroColors.Flame400,
    onSecondary = GymBroColors.Ink950,
    background = GymBroColors.Ink950,
    onBackground = Color.White,
    surface = GymBroColors.Ink900,
    onSurface = Color.White,
    surfaceVariant = GymBroColors.Ink800,
    onSurfaceVariant = GymBroColors.Ink300,
    outline = GymBroColors.Ink700,
    outlineVariant = GymBroColors.Ink800,
    error = Color(0xFFEF4444),
    onError = Color.White,
)

private val GymBroTypography = Typography(
    displaySmall = TextStyle(fontSize = 32.sp, fontWeight = FontWeight.Bold),
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    bodySmall = TextStyle(fontSize = 12.sp),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold),
)

/**
 * The app is dark-only by design, so the system setting is read but does not
 * switch schemes — it only exists to keep previews honest.
 */
@Composable
fun GymBroTheme(
    @Suppress("UNUSED_PARAMETER") darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = GymBroScheme,
        typography = GymBroTypography,
        content = content,
    )
}
