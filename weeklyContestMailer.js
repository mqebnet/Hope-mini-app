const nodemailer = require('nodemailer');
const cron = require('node-cron');
const Contestant = require('./models/Contestant');

// Configure transporter (adjust with your SMTP settings)
const transporter = nodemailer.createTransport({
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Schedule the job to run every Monday at 00:10 AM (adjust as needed)
cron.schedule('10 0 * * 1', async () => {
  try {
    const week = process.env.CURRENT_CONTEST_WEEK || "Week 1";
    const contestants = await Contestant.find({ week });
    
    if (contestants.length === 0) return console.log('No contestants for', week);

    let report = `Contestants for ${week}:\n\n`;
    contestants.forEach((entry, index) => {
      report += `${index + 1}. TelegramId: ${entry.telegramId}, Wallet: ${entry.wallet}, Entered At: ${entry.enteredAt}\n`;
    });

    // Send email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.DEV_EMAIL,
      subject: `Contest Report for ${week}`,
      text: report
    };

    await transporter.sendMail(mailOptions);
    console.log(`Weekly contest report for ${week} sent successfully.`);
  } catch (error) {
    console.error('Error sending weekly contest report:', error);
  }
});
R