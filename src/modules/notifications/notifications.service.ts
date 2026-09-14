/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { env } from '../../config/env.config.js';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import { initializeApp, cert, getApps } from 'firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private twilioClient: any = null;
  private emailTransporter: any = null;
  private isFirebaseInitialized = false;

  constructor(
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {
    this.initializeTwilio();
    this.initializeEmail();
    this.initializeFirebase();
  }

  private initializeTwilio() {
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      try {
        this.twilioClient = twilio(
          env.TWILIO_ACCOUNT_SID,
          env.TWILIO_AUTH_TOKEN,
        );
        this.logger.log('Twilio client initialized successfully.');
      } catch (err: any) {
        this.logger.error(
          `Failed to initialize Twilio client: ${err?.message}`,
        );
      }
    } else {
      this.logger.warn(
        'Twilio credentials not found in env. Falling back to console logging for SMS.',
      );
    }
  }

  private initializeEmail() {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      try {
        this.emailTransporter = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT) || 587,
          secure: Number(env.SMTP_PORT) === 465,
          auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          },
        });
        this.logger.log('SMTP email transporter initialized successfully.');
      } catch (err: any) {
        this.logger.error(
          `Failed to initialize SMTP email transporter: ${err?.message}`,
        );
      }
    } else {
      this.logger.warn(
        'SMTP credentials not found in env. Falling back to console logging for Emails.',
      );
    }
  }

  private initializeFirebase() {
    try {
      const serviceAccountStr = process.env.FCM_SERVICE_ACCOUNT_JSON;
      if (serviceAccountStr) {
        if (getApps().length === 0) {
          const serviceAccount = JSON.parse(serviceAccountStr);
          initializeApp({
            credential: cert(serviceAccount),
          });
        }
        this.isFirebaseInitialized = true;
        this.logger.log('Firebase Admin SDK initialized successfully.');
      } else {
        this.logger.warn(
          'FCM_SERVICE_ACCOUNT_JSON not found in env. Falling back to console logging for Push Notifications.',
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to initialize Firebase Admin SDK: ${err?.message}`,
      );
    }
  }

  // --- Queueing Methods ---

  async queueSuperLikeNotification(actorId: string, targetUserId: string) {
    await this.notificationsQueue.add('super_like', { actorId, targetUserId });
    this.logger.log(
      `Queued super_like job for actor: ${actorId} -> target: ${targetUserId}`,
    );
  }

  async queueMatchNotification(userAId: string, userBId: string) {
    await this.notificationsQueue.add('match', { userAId, userBId });
    this.logger.log(
      `Queued match job for user A: ${userAId} <-> user B: ${userBId}`,
    );
  }

  async queueMessageNotification(
    senderId: string,
    receiverId: string,
    messageContent: string,
  ) {
    await this.notificationsQueue.add('message', {
      senderId,
      receiverId,
      messageContent,
    });
    this.logger.log(
      `Queued message job for sender: ${senderId} -> receiver: ${receiverId}`,
    );
  }

  // --- Real Delivery Methods ---

  async sendSms(to: string, body: string): Promise<boolean> {
    if (this.twilioClient) {
      try {
        await this.twilioClient.messages.create({
          body,
          to,
          from: process.env.TWILIO_PHONE_NUMBER || '+1234567890',
        });
        this.logger.log(`SMS successfully sent via Twilio to: ${to}`);
        return true;
      } catch (err: any) {
        this.logger.error(`Failed to send SMS to ${to}: ${err?.message}`);
        return false;
      }
    } else {
      this.logger.log(`[Twilio SMS Fallback Log] To: ${to} | Message: ${body}`);
      return true;
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    htmlBody: string,
  ): Promise<boolean> {
    if (this.emailTransporter) {
      try {
        await this.emailTransporter.sendMail({
          from: env.SMTP_USER,
          to,
          subject,
          html: htmlBody,
        });
        this.logger.log(`Email successfully sent via SMTP to: ${to}`);
        return true;
      } catch (err: any) {
        this.logger.error(`Failed to send email to ${to}: ${err?.message}`);
        return false;
      }
    } else {
      this.logger.log(
        `[SMTP Email Fallback Log] To: ${to} | Subject: ${subject} | Body: ${htmlBody}`,
      );
      return true;
    }
  }

  async sendPushNotification(
    token: string | null,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<boolean> {
    if (!token) {
      this.logger.warn(
        `No FCM device token provided for push notification: "${title}"`,
      );
      return false;
    }

    if (this.isFirebaseInitialized) {
      try {
        await getMessaging().send({
          token,
          notification: {
            title,
            body,
          },
          data,
        });
        this.logger.log(
          `Push notification successfully sent via FCM to token: ${token.substring(0, 10)}...`,
        );
        return true;
      } catch (err: any) {
        this.logger.error(
          `Failed to send FCM push notification: ${err?.message}`,
        );
        return false;
      }
    } else {
      this.logger.log(
        `[Firebase FCM Fallback Log] Token: ${token.substring(0, 10)}... | Title: "${title}" | Body: "${body}" | Data: ${JSON.stringify(data)}`,
      );
      return true;
    }
  }
}
