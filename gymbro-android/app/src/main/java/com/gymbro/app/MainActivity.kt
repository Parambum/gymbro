package com.gymbro.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.gymbro.app.ui.GymBroColors
import com.gymbro.app.ui.GymBroTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            GymBroTheme {
                Scaffold(
                    containerColor = GymBroColors.Ink950,
                    modifier = Modifier.fillMaxSize(),
                ) { inner ->
                    ToolchainCheck(Modifier.padding(inner))
                }
            }
        }
    }
}

/**
 * Placeholder screen. Its only job is to prove the Kotlin/Compose toolchain
 * builds, installs and renders before the real app is layered on.
 */
@Composable
private fun ToolchainCheck(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(GymBroColors.Ink950),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(GymBroColors.Flame500),
        )
        Text(
            text = "GymBro",
            style = MaterialTheme.typography.displaySmall,
            color = androidx.compose.ui.graphics.Color.White,
            modifier = Modifier.padding(top = 20.dp),
        )
        Text(
            text = "Kotlin + Jetpack Compose",
            style = MaterialTheme.typography.bodyMedium,
            color = GymBroColors.Ink400,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun ToolchainCheckPreview() {
    GymBroTheme { ToolchainCheck() }
}
