package com.gymbro.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * A deliberately small Markdown renderer covering what a coaching reply
 * actually contains: headings, bullets, numbered steps, bold/italic/code and
 * fenced blocks. Hand-rolled rather than pulled from a library so it carries
 * no version-compatibility risk.
 */
@Composable
fun MarkdownText(
    markdown: String,
    modifier: Modifier = Modifier,
    baseColor: Color = GymBroColors.Ink200,
) {
    val blocks = remember(markdown) { parseBlocks(markdown) }

    Column(modifier = modifier) {
        blocks.forEach { block ->
            when (block) {
                is MdBlock.Heading -> Text(
                    text = inline(block.text),
                    color = Color.White,
                    fontSize = when (block.level) {
                        1 -> 22.sp
                        2 -> 18.sp
                        else -> 16.sp
                    },
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
                )

                is MdBlock.Paragraph -> Text(
                    text = inline(block.text),
                    color = baseColor,
                    fontSize = 15.sp,
                    lineHeight = 21.sp,
                    modifier = Modifier.padding(vertical = 3.dp),
                )

                is MdBlock.Bullet -> Row(modifier = Modifier.padding(vertical = 2.dp)) {
                    Text(
                        text = block.marker,
                        color = GymBroColors.Flame400,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(end = 8.dp, start = (block.depth * 14).dp),
                    )
                    Text(
                        text = inline(block.text),
                        color = baseColor,
                        fontSize = 15.sp,
                        lineHeight = 21.sp,
                    )
                }

                is MdBlock.Code -> Text(
                    text = AnnotatedString(block.text),
                    color = GymBroColors.Flame300,
                    fontSize = 13.sp,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier
                        .padding(vertical = 6.dp)
                        .fillMaxWidth()
                        .background(GymBroColors.Ink850, RoundedCornerShape(8.dp))
                        .horizontalScroll(rememberScrollState())
                        .padding(10.dp),
                )

                MdBlock.Rule -> Text(
                    text = "",
                    modifier = Modifier
                        .padding(vertical = 8.dp)
                        .fillMaxWidth()
                        .background(GymBroColors.Ink800),
                    fontSize = 1.sp,
                )
            }
        }
    }
}

private sealed interface MdBlock {
    data class Heading(val level: Int, val text: String) : MdBlock
    data class Paragraph(val text: String) : MdBlock
    data class Bullet(val marker: String, val text: String, val depth: Int) : MdBlock
    data class Code(val text: String) : MdBlock
    data object Rule : MdBlock
}

private val BULLET = Regex("""^(\s*)[-*+]\s+(.*)$""")
private val NUMBERED = Regex("""^(\s*)(\d+)[.)]\s+(.*)$""")
private val HEADING = Regex("""^(#{1,6})\s+(.*)$""")

private fun parseBlocks(markdown: String): List<MdBlock> {
    val blocks = mutableListOf<MdBlock>()
    val lines = markdown.split("\n")
    var i = 0
    val paragraph = StringBuilder()

    fun flushParagraph() {
        if (paragraph.isNotBlank()) blocks += MdBlock.Paragraph(paragraph.toString().trim())
        paragraph.clear()
    }

    while (i < lines.size) {
        val line = lines[i]

        // Fenced code block: consume until the closing fence or end of input.
        if (line.trimStart().startsWith("```")) {
            flushParagraph()
            val body = StringBuilder()
            i++
            while (i < lines.size && !lines[i].trimStart().startsWith("```")) {
                if (body.isNotEmpty()) body.append('\n')
                body.append(lines[i])
                i++
            }
            i++ // skip closing fence
            blocks += MdBlock.Code(body.toString())
            continue
        }

        when {
            line.isBlank() -> flushParagraph()

            line.trim().let { it == "---" || it == "***" || it == "___" } -> {
                flushParagraph()
                blocks += MdBlock.Rule
            }

            HEADING.matches(line) -> {
                flushParagraph()
                val m = HEADING.find(line)!!
                blocks += MdBlock.Heading(m.groupValues[1].length, m.groupValues[2])
            }

            BULLET.matches(line) -> {
                flushParagraph()
                val m = BULLET.find(line)!!
                blocks += MdBlock.Bullet("•", m.groupValues[2], m.groupValues[1].length / 2)
            }

            NUMBERED.matches(line) -> {
                flushParagraph()
                val m = NUMBERED.find(line)!!
                blocks += MdBlock.Bullet(
                    "${m.groupValues[2]}.",
                    m.groupValues[3],
                    m.groupValues[1].length / 2,
                )
            }

            else -> {
                if (paragraph.isNotEmpty()) paragraph.append(' ')
                paragraph.append(line.trim())
            }
        }
        i++
    }
    flushParagraph()
    return blocks
}

/** Handles `**bold**`, `*italic*`/`_italic_` and `` `code` `` in a single pass. */
private fun inline(text: String): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        when {
            text.startsWith("**", i) -> {
                val end = text.indexOf("**", i + 2)
                if (end == -1) {
                    append(text.substring(i)); return@buildAnnotatedString
                }
                withSpan(SpanStyle(fontWeight = FontWeight.Bold)) {
                    append(text.substring(i + 2, end))
                }
                i = end + 2
            }

            text[i] == '`' -> {
                val end = text.indexOf('`', i + 1)
                if (end == -1) {
                    append(text.substring(i)); return@buildAnnotatedString
                }
                withSpan(
                    SpanStyle(
                        fontFamily = FontFamily.Monospace,
                        color = GymBroColors.Flame300,
                    ),
                ) {
                    append(text.substring(i + 1, end))
                }
                i = end + 1
            }

            (text[i] == '*' || text[i] == '_') -> {
                val marker = text[i]
                val end = text.indexOf(marker, i + 1)
                if (end == -1) {
                    append(text.substring(i)); return@buildAnnotatedString
                }
                withSpan(SpanStyle(fontStyle = FontStyle.Italic)) {
                    append(text.substring(i + 1, end))
                }
                i = end + 1
            }

            else -> {
                append(text[i])
                i++
            }
        }
    }
}

private inline fun androidx.compose.ui.text.AnnotatedString.Builder.withSpan(
    style: SpanStyle,
    block: androidx.compose.ui.text.AnnotatedString.Builder.() -> Unit,
) {
    val start = length
    block()
    addStyle(style, start, length)
}
