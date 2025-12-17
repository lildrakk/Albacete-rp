// index.js
// Bot de Discord para cuestionarios RP
// Requisitos: Node.js 18+, discord.js v14
// Instala dependencias: npm install discord.js dotenv

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
});

// Preguntas del cuestionario
const questions = [
  "¿Cuál es tu nombre de usuario en Roblox?",
  "¿Qué es el Roleplay (RP)?",
  "¿Qué significa IC?",
  "¿Qué significa OOC?",
  "¿Qué es Metagaming (MG)?",
  "¿Qué es Powergaming (PG)?",
  "¿Está permitido hacer RDM o VDM? ¿Por qué?",
  "Si un staff te llama durante una situación de rol, ¿qué debes hacer?",
  "¿Has leído y aceptas las normas de Discord y RP de Albacete RP?"
];

// Sesiones en memoria
const quizSessions = new Map(); // userId -> { step, answers, guildId }

// Buscar canal staff
async function getStaffChannel(guild, name = 'revisión-cuestionarios') {
  const channel = guild.channels.cache.find(ch => ch.name === name);
  if (!channel) throw new Error(`No se encontró el canal "${name}".`);
  return channel;
}

client.once('ready', () => {
  console.log(`Bot conectado como ${client.user.tag}`);
});

// Panel en servidor
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.content.trim() === '!panel') {
    const embed = new EmbedBuilder()
      .setTitle("📋 Panel de cuestionarios RP")
      .setDescription("Pulsa el botón para iniciar tu cuestionario en DM.\nAsegúrate de tener los DMs abiertos.")
      .setColor(0x00A3FF);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('startQuiz')
        .setLabel('Iniciar cuestionario')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  }
});

// Botón de inicio
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'startQuiz') {
    quizSessions.set(interaction.user.id, {
      step: 0,
      answers: [],
      guildId: interaction.guildId,
    });

    await interaction.reply({ content: 'Te he enviado un DM con el cuestionario. ¡Revísalo!', ephemeral: true });

    try {
      await interaction.user.send("¡Vamos a empezar tu cuestionario RP!");
      await interaction.user.send(questions[0]);
    } catch {
      await interaction.followUp({ content: 'No pude enviarte DM. Activa tus mensajes privados.', ephemeral: true });
      quizSessions.delete(interaction.user.id);
    }
  }

  // Aprobar
  if (interaction.customId.startsWith('approve_')) {
    const userId = interaction.customId.split('_')[1];
    await interaction.deferUpdate();
    try {
      const user = await client.users.fetch(userId);
      await user.send('✅ Has pasado la prueba. ¡Bienvenido a Albacete RP!');
    } catch {}
    await interaction.editReply({ content: 'Aprobado y notificado por DM.', components: [] });
  }

  // Rechazar
  if (interaction.customId.startsWith('reject_')) {
    const userId = interaction.customId.split('_')[1];
    const modal = new ModalBuilder()
      .setCustomId(`rejectModal_${userId}`)
      .setTitle('Razón de rechazo');

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Escribe la razón')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const modalRow = new ActionRowBuilder().addComponents(reasonInput);
    modal.addComponents(modalRow);

    await interaction.showModal(modal);
  }
});

// Modal de rechazo
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith('rejectModal_')) return;

  const userId = interaction.customId.split('_')[1];
  const reason = interaction.fields.getTextInputValue('reason');

  await interaction.deferUpdate();

  try {
    const user = await client.users.fetch(userId);
    await user.send(`❌ No has pasado la prueba.\nRazón: ${reason}`);
  } catch {}

  try {
    const msg = await interaction.message.fetch();
    await msg.edit({ content: 'Rechazado y notificado por DM.', components: [] });
  } catch {}
});

// Respuestas en DM
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.type !== 1) return; // Solo DM

  const session = quizSessions.get(message.author.id);
  if (!session) return;

  const content = message.content.trim();

  if (content.toLowerCase() === 'cancelar') {
    quizSessions.delete(message.author.id);
    await message.channel.send('Has cancelado el cuestionario.');
    return;
  }

  session.answers.push(content);
  session.step += 1;

  if (session.step < questions.length) {
    await message.channel.send(questions[session.step]);
  } else {
    quizSessions.delete(message.author.id);
    const guild = client.guilds.cache.get(session.guildId);
    if (!guild) return;

    let staffChannel;
    try {
      staffChannel = await getStaffChannel(guild);
    } catch {
      await message.channel.send('El canal "revisión-cuestionarios" no existe.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`Respuestas de ${message.author.tag}`)
      .setColor(0xFFD000)
      .addFields(
        questions.map((q, i) => ({ name: `${i + 1}. ${q}`, value: session.answers[i] || 'Sin respuesta' }))
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_${message.author.id}`)
        .setLabel('✅ Aprobar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`reject_${message.author.id}`)
        .setLabel('❌ Rechazar')
        .setStyle(ButtonStyle.Danger)
    );

    await staffChannel.send({ embeds: [embed], components: [row] });
    await message.channel.send('Tus respuestas han sido enviadas al staff. Recibirás un DM con el resultado.');
  }
});

client.login(process.env.DISCORD_TOKEN);
