import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  PermissionsBitField,
  Routes,
  REST,
} from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import crypto from "crypto";
dotenv.config();

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const TICKET_CATEGORY_ID = "1432114621015392417";
const SUPPORT_ROLE_ID = "1432851773827055706";
const LOG_CHANNEL_ID = "1432114709007699998";
const TICKET_PANEL_CHANNEL_ID = "1432114679660023848";
const ALLOWED_ROLE_ID = "1432114598634324151";

const LOGS_FOLDER = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOGS_FOLDER)) fs.mkdirSync(LOGS_FOLDER, { recursive: true });

const channelEvents = new Map();
const messageSnapshots = new Map();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

const PURPLE = "Purple";

// ------------------ Helpers ------------------
function generateTicketID() {
  return `TICKET-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function pushChannelEvent(channelId, event) {
  if (!channelEvents.has(channelId)) channelEvents.set(channelId, []);
  channelEvents.get(channelId).push(event);
}

function snapshotFromMessage(message) {
  return {
    id: message.id,
    channelId: message.channelId,
    authorId: message.author?.id ?? "Unknown",
    authorTag: message.author?.tag ?? "Unknown#0000",
    content: message.content ?? "",
    attachments: message.attachments?.map(a => ({ url: a.url, name: a.name })) ?? [],
    timestamp: message.createdTimestamp ?? Date.now(),
    editedTimestamp: message.editedTimestamp ?? null,
  };
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHtmlTranscript(meta, events) {
  const rows = events.map(ev => {
    const time = new Date(ev.timestamp).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC";
    if (ev.type === "create") {
      const attHtml = (ev.attachments || [])
        .map(a => `<a href="${escapeHtml(a.url)}" target="_blank">${escapeHtml(a.name ?? a.url)}</a>`)
        .join("<br>");
      return `<div class="row create"><div class="meta">[${time}] <strong>${escapeHtml(ev.authorTag)}</strong> (${escapeHtml(ev.authorId)})</div><div class="content">${escapeHtml(ev.content || "")}${attHtml ? "<div class='attachments'>" + attHtml + "</div>" : ""}</div></div>`;
    } else if (ev.type === "edit") {
      const oldHtml = escapeHtml(ev.oldContent || "");
      const newHtml = escapeHtml(ev.newContent || "");
      return `<div class="row edit"><div class="meta">[${time}] <strong>${escapeHtml(ev.authorTag)}</strong> edited message (${escapeHtml(ev.authorId)})</div><div class="content"><div class="label">Before:</div><pre>${oldHtml}</pre><div class="label">After:</div><pre>${newHtml}</pre></div></div>`;
    } else if (ev.type === "delete") {
      const contentHtml = escapeHtml(ev.content || "");
      return `<div class="row delete"><div class="meta">[${time}] <strong>${escapeHtml(ev.authorTag)}</strong> deleted a message (${escapeHtml(ev.authorId)})</div><div class="content"><pre>${contentHtml}</pre></div></div>`;
    }
    return `<div class="row"><div class="meta">[${time}] ${escapeHtml(JSON.stringify(ev))}</div></div>`;
  }).join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(meta.ticketId)} — Transcript</title>
<style>
body { font-family: Inter, Roboto, Arial, sans-serif; background:#0f0b13; color:#e9e6f3; padding:20px; }
.row { border-left:3px solid rgba(214,183,255,0.12); padding:10px 12px; margin-bottom:10px; border-radius:8px; background:rgba(255,255,255,0.02);}
.row.create{border-left-color:#8b5cf6;}
.row.edit{border-left-color:#a78bfa;}
.row.delete{border-left-color:#f472b6;}
.meta{font-size:0.9rem;color:#cfc7f6;margin-bottom:6px;}
.content pre{white-space:pre-wrap;font-family:monospace;background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;color:#efeaff;}
.label{font-weight:600;color:#d6b7ff;margin-top:6px;}
</style>
</head>
<body>
<h1>${escapeHtml(meta.ticketId)}</h1>
<div class="meta-info">Channel: ${escapeHtml(meta.channelName)} | Opened by: ${escapeHtml(meta.openedByTag)} | Open time: ${escapeHtml(meta.openTime)}</div>
<div class="transcript">${rows}</div>
</body>
</html>`;
}

// ------------------ Message Events ------------------
client.on("messageCreate", msg => {
  if (!msg.guild || !msg.channel?.name?.startsWith("ticket-")) return;
  const snap = snapshotFromMessage(msg);
  messageSnapshots.set(msg.id, snap);
  pushChannelEvent(msg.channelId, { type: "create", ...snap });
});

client.on("messageUpdate", (oldMsg, newMsg) => {
  const name = newMsg.channel?.name ?? oldMsg.channel?.name ?? "";
  if (!name.startsWith("ticket-")) return;
  const prev = messageSnapshots.get(newMsg.id);
  const oldContent = prev?.content ?? oldMsg?.content ?? "";
  const newContent = newMsg.content ?? "";
  const snap = {
    id: newMsg.id,
    channelId: newMsg.channelId,
    authorId: newMsg.author?.id ?? prev?.authorId ?? "Unknown",
    authorTag: newMsg.author?.tag ?? prev?.authorTag ?? "Unknown#0000",
    content: newContent,
    attachments: newMsg.attachments?.map(a => ({ url: a.url, name: a.name })) ?? prev?.attachments ?? [],
    timestamp: prev?.timestamp ?? newMsg.createdTimestamp ?? Date.now(),
    editedTimestamp: newMsg.editedTimestamp ?? Date.now(),
  };
  messageSnapshots.set(newMsg.id, snap);
  pushChannelEvent(snap.channelId, { type: "edit", timestamp: Date.now(), messageId: newMsg.id, authorId: snap.authorId, authorTag: snap.authorTag, oldContent, newContent });
});

client.on("messageDelete", msg => {
  if (!msg.channel?.name?.startsWith("ticket-")) return;
  const snap = messageSnapshots.get(msg.id);
  pushChannelEvent(msg.channelId, { type: "delete", timestamp: Date.now(), messageId: msg.id, authorId: snap?.authorId ?? msg?.author?.id ?? "Unknown", authorTag: snap?.authorTag ?? msg?.author?.tag ?? "Unknown#0000", content: snap?.content ?? msg?.content ?? "" });
  messageSnapshots.delete(msg.id);
});

// ------------------ Slash Commands ------------------
const commands = [
  { name: "ticket", description: "Open the panel to create a ticket" },
  { name: "close", description: "Close the current ticket" },
];
const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Slash commands registered!");
  } catch (err) { console.error(err); }
})();

// ------------------ Interactions ------------------
client.on("interactionCreate", async interaction => {
  try {
    const guild = interaction.guild;
    const member = interaction.member;

    // ---------- /ticket ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "ticket") {
      if (!member.roles.cache.has(ALLOWED_ROLE_ID))
        return interaction.reply({ content: "❌ You don't have permission to open a ticket.", flags: 64 });

      const panelChannel = guild.channels.cache.get(TICKET_PANEL_CHANNEL_ID);
      if (!panelChannel) return interaction.reply({ content: "❌ Ticket panel channel not found.", flags: 64 });

      const embed = new EmbedBuilder()
        .setTitle("🎫・Open a Ticket")
        .setDescription("Select the category of your ticket from the menu below.\n\n💬 General Support\n🐞 Bug Report\n🧑‍💼 Staff Application")
        .setColor(PURPLE);

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select_ticket_category")
        .setPlaceholder("Select a category")
        .addOptions([
          { label: "General Support", emoji: "💬", value: "general_support" },
          { label: "Bug Report", emoji: "🐞", value: "bug_report" },
          { label: "Staff Application || Coming soon...", emoji: "🧑‍💼", value: "staff_application" },
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      await panelChannel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: `✅ Ticket panel sent in ${panelChannel}`, flags: 64 });
    }

    // ---------- /close ----------
    if (interaction.isChatInputCommand() && interaction.commandName === "close") {
      const channel = interaction.channel;
      if (!channel || !channel.name.startsWith("ticket-"))
        return interaction.reply({ content: "❌ This command can only be used in ticket channels.", flags: 64 });

      const [userId, openTime] = channel.topic?.split("|") || ["Unknown", "Unknown"];
      const ticketId = generateTicketID();

      // Fetch all messages in the channel
      const fetchedMessages = [];
      let lastId;
      while (true) {
        const options = lastId ? { limit: 100, before: lastId } : { limit: 100 };
        const page = await channel.messages.fetch(options);
        if (!page.size) break;
        for (const m of page.values()) fetchedMessages.push(snapshotFromMessage(m));
        if (page.size < 100) break;
        lastId = page.last().id;
      }

      const storedEvents = channelEvents.get(channel.id) || [];
      const allEvents = [...fetchedMessages.map(m => ({ type: "create", ...m })), ...storedEvents];
      allEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      const meta = { ticketId, channelName: channel.name, openedById: userId, openedByTag: `<@${userId}>`, openTime };
      const html = buildHtmlTranscript(meta, allEvents);
      fs.writeFileSync(path.join(LOGS_FOLDER, `${ticketId}.html`), html, "utf8");

      const embed = new EmbedBuilder()
        .setTitle("Ticket Closed")
        .setDescription("Your ticket has been closed.")
        .addFields(
          { name: "Ticket ID", value: ticketId, inline: true },
          { name: "Channel", value: channel.name, inline: true },
          { name: "Closed by", value: interaction.user.tag, inline: true }
        )
        .setColor(PURPLE)
        .setTimestamp();

      await interaction.reply({ content: `✅ Ticket closed. ID: **${ticketId}**`, embeds: [embed], flags: 64 });

      // Log channel
      const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) await logChannel.send({ embeds: [embed] });

      // DM user
      if (userId !== "Unknown") {
        client.users.fetch(userId)
          .then(u => u.send({ embeds: [embed] }).catch(() => null))
          .catch(() => null);
      }

      channelEvents.delete(channel.id);
      for (const [msgId, snap] of messageSnapshots.entries()) {
        if (snap.channelId === channel.id) messageSnapshots.delete(msgId);
      }

      try { await channel.delete(`Ticket closed by ${interaction.user.tag} - ${ticketId}`); } 
      catch (err) { console.error(err); }
    }

    // ---------- Select Menu ----------
    if (interaction.isStringSelectMenu() && interaction.customId === "select_ticket_category") {
      const selected = interaction.values[0];

      if (selected === "staff_application") {
        const modal = new ModalBuilder()
          .setCustomId("coming_soon_modal")
          .setTitle("🧑‍💼 Staff Application")
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("coming_soon_text")
            .setLabel("🚧 Coming soon...")
            .setStyle(TextInputStyle.Paragraph)
            .setValue("This feature will be available soon!")
            .setRequired(false)
          ));
        return interaction.showModal(modal);
      }

      const existing = guild.channels.cache.find(ch => ch.name === `ticket-${member.user.id}` && ch.parentId === TICKET_CATEGORY_ID);
      if (existing) return interaction.reply({ content: `You already have an open ticket: ${existing}`, flags: 64 });

      const channelName = `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g,"")}-${member.user.discriminator}`;
      const openTime = `<t:${Math.floor(Date.now() / 1000)}:F>`;
      const channel = await guild.channels.create({
        name: channelName,
        type: 0,
        parent: TICKET_CATEGORY_ID,
        topic: `${member.user.id}|${openTime}`,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: member.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
          { id: SUPPORT_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        ],
      });

      // Initialize channel events
      channelEvents.set(channel.id, []);

      // ✅ NEW: send welcome message tagging the user and staff role
      await channel.send({
        content: `Hello ${member.user}, a staff member <@&${SUPPORT_ROLE_ID}> will assist you shortly!`,
        allowedMentions: { users: [member.user.id], roles: [SUPPORT_ROLE_ID] }
      });

      if (selected === "general_support") {
        const modal = new ModalBuilder()
          .setCustomId(`modal_support_${channel.id}`)
          .setTitle("💬 General Support")
          .addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("discord_name").setLabel("Discord Nickname").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("description").setLabel("Problem Description").setStyle(TextInputStyle.Paragraph).setRequired(true))
          );
        return interaction.showModal(modal);
      }

      if (selected === "bug_report") {
        const modal = new ModalBuilder()
          .setCustomId(`modal_bug_${channel.id}`)
          .setTitle("🐞 Bug Report")
          .addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("discord_name").setLabel("Discord Nickname").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bug_type").setLabel("Bug Type").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bug_proof").setLabel("Bug Proof").setStyle(TextInputStyle.Paragraph).setRequired(true))
          );
        return interaction.showModal(modal);
      }

      return interaction.reply({ content: "Selection error.", flags: 64 });
    }

    // ---------- Modal Submit ----------
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "coming_soon_modal")
        return interaction.reply({ content: "🚧 Coming soon...", flags: 64 });

      const channelId = interaction.customId.split("_").pop();
      const channel = guild.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: "Error: channel not found", flags: 64 });

      if (interaction.customId.startsWith("modal_support")) {
        const discordName = interaction.fields.getTextInputValue("discord_name");
        const description = interaction.fields.getTextInputValue("description");
        const embed = new EmbedBuilder()
          .setTitle("💬 Support Request")
          .addFields({ name: "Discord Nickname", value: discordName }, { name: "Description", value: description })
          .setColor(PURPLE);
        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: "✅ Form submitted!", flags: 64 });
      }

      if (interaction.customId.startsWith("modal_bug")) {
        const discordName = interaction.fields.getTextInputValue("discord_name");
        const bugType = interaction.fields.getTextInputValue("bug_type");
        const bugProof = interaction.fields.getTextInputValue("bug_proof");
        const embed = new EmbedBuilder()
          .setTitle("🐞 Bug Report")
          .addFields(
            { name: "Discord Nickname", value: discordName },
            { name: "Bug Type", value: bugType },
            { name: "Bug Proof", value: bugProof }
          )
          .setColor(PURPLE);
        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: "✅ Form submitted!", flags: 64 });
      }
    }

  } catch (err) {
    console.error("Interaction error:", err);
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: "Internal error.", flags: 64 });
      else await interaction.reply({ content: "Internal error.", flags: 64 });
    } catch {}
  }
});

client.once("ready", () => console.log(`✅ Bot ready as ${client.user.tag}`));
client.login(TOKEN);
