package com.gymbro.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gymbro.app.data.LoggedSet
import com.gymbro.app.data.formatWeight

@Composable
fun SetRowHeader() {
    Row(
        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        HeaderLabel("Set", Modifier.width(28.dp))
        HeaderLabel("Previous", Modifier.weight(1f))
        HeaderLabel("kg", Modifier.width(64.dp))
        HeaderLabel("Reps", Modifier.width(56.dp))
        Box(Modifier.size(40.dp))
    }
}

@Composable
private fun HeaderLabel(text: String, modifier: Modifier) {
    Text(
        text = text.uppercase(),
        modifier = modifier,
        color = GymBroColors.Ink600,
        fontSize = 9.sp,
        fontWeight = FontWeight.SemiBold,
        textAlign = TextAlign.Center,
    )
}

@Composable
fun SetRow(
    index: Int,
    set: LoggedSet,
    previous: LoggedSet?,
    onWeightChange: (Double?) -> Unit,
    onRepsChange: (Int?) -> Unit,
    onToggle: () -> Unit,
    onRemove: () -> Unit,
) {
    val previousLabel = if (previous?.weight != null && previous.reps != null) {
        "${formatWeight(previous.weight)} × ${previous.reps}"
    } else {
        "—"
    }

    Row(
        modifier = Modifier
            .padding(top = 6.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (set.completed) GymBroColors.Flame500.copy(alpha = 0.10f) else Color.Transparent)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Long-press the set number to delete the row.
        Box(
            modifier = Modifier
                .width(28.dp)
                .clickable(onClick = onRemove),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "${index + 1}",
                color = if (set.completed) GymBroColors.Flame400 else GymBroColors.Ink500,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        Text(
            text = previousLabel,
            modifier = Modifier.weight(1f),
            color = GymBroColors.Ink500,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
        )

        NumCell(
            external = set.weight?.let { formatWeight(it) } ?: "",
            placeholder = previous?.weight?.let { formatWeight(it) } ?: "0",
            enabled = !set.completed,
            decimal = true,
            modifier = Modifier.width(64.dp),
            onChange = { onWeightChange(it.toDoubleOrNull()) },
        )

        NumCell(
            external = set.reps?.toString() ?: "",
            placeholder = previous?.reps?.toString() ?: "0",
            enabled = !set.completed,
            decimal = false,
            modifier = Modifier.width(56.dp),
            onChange = { onRepsChange(it.toIntOrNull()) },
        )

        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(if (set.completed) GymBroColors.Flame500 else GymBroColors.Ink800)
                .clickable(onClick = onToggle),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Check,
                contentDescription = if (set.completed) "Completed" else "Mark set complete",
                tint = if (set.completed) GymBroColors.Ink950 else GymBroColors.Ink600,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/**
 * Holds the raw text locally so partial input ("60.") survives a keystroke,
 * and re-syncs only when the stored value genuinely diverges — otherwise an
 * external update would fight the keyboard.
 */
@Composable
private fun NumCell(
    external: String,
    placeholder: String,
    enabled: Boolean,
    decimal: Boolean,
    modifier: Modifier,
    onChange: (String) -> Unit,
) {
    var text by remember { mutableStateOf(external) }

    LaunchedEffect(external) {
        if (external != text.trim()) text = external
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(GymBroColors.Ink800)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (text.isEmpty()) {
            Text(
                text = placeholder,
                color = GymBroColors.Ink600,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        BasicTextField(
            value = text,
            onValueChange = { raw ->
                val filtered = raw.filter { it.isDigit() || (decimal && it == '.') }.take(6)
                text = filtered
                onChange(filtered)
            },
            enabled = enabled,
            singleLine = true,
            textStyle = TextStyle(
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            ),
            cursorBrush = SolidColor(GymBroColors.Flame500),
            keyboardOptions = KeyboardOptions(
                keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
