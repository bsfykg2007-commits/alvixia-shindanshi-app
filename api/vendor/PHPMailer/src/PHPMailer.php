<?php
declare(strict_types=1);

namespace PHPMailer\PHPMailer;

class PHPMailer
{
    public const ENCRYPTION_STARTTLS = 'tls';
    public const ENCRYPTION_SMTPS = 'ssl';

    public string $Host = '';
    public int $Port = 587;
    public bool $SMTPAuth = true;
    public string $Username = '';
    public string $Password = '';
    public string $SMTPSecure = self::ENCRYPTION_STARTTLS;
    public string $CharSet = 'UTF-8';
    public string $Encoding = 'base64';
    public string $Subject = '';
    public string $Body = '';
    public string $AltBody = '';
    public string $Sender = '';
    public string $ErrorInfo = '';
    public int $SMTPDebug = SMTP::DEBUG_OFF;

    private string $from = '';
    private string $fromName = '';
    private array $to = [];
    private array $replyTo = [];

    public function isSMTP(): void
    {
    }

    public function setFrom(string $address, string $name = ''): void
    {
        $this->from = $address;
        $this->fromName = $name;
    }

    public function addAddress(string $address): void
    {
        $this->to[] = $address;
    }

    public function addReplyTo(string $address): void
    {
        $this->replyTo[] = $address;
    }

    public function isHTML(bool $isHtml = true): void
    {
    }

    public function send(): bool
    {
        $socket = null;
        try {
            $socket = $this->connect();
            $this->expect($socket, [220]);
            $host = $this->Host ?: 'localhost';
            $this->command($socket, 'EHLO ' . $host, [250]);

            if (strtolower($this->SMTPSecure) === self::ENCRYPTION_STARTTLS) {
                $this->command($socket, 'STARTTLS', [220]);
                if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new Exception('STARTTLS failed');
                }
                $this->command($socket, 'EHLO ' . $host, [250]);
            }

            if ($this->SMTPAuth) {
                $this->command($socket, 'AUTH LOGIN', [334]);
                $this->command($socket, base64_encode($this->Username), [334]);
                $this->command($socket, base64_encode($this->Password), [235]);
            }

            $from = $this->Sender ?: $this->from;
            $this->command($socket, 'MAIL FROM:<' . $from . '>', [250]);
            foreach ($this->to as $address) {
                $this->command($socket, 'RCPT TO:<' . $address . '>', [250, 251]);
            }
            $this->command($socket, 'DATA', [354]);
            fwrite($socket, $this->buildMessage() . "\r\n.\r\n");
            $this->expect($socket, [250]);
            $this->command($socket, 'QUIT', [221]);
            fclose($socket);
            return true;
        } catch (\Throwable $e) {
            $this->ErrorInfo = $e->getMessage();
            if (is_resource($socket)) {
                fclose($socket);
            }
            return false;
        }
    }

    private function connect()
    {
        $prefix = strtolower($this->SMTPSecure) === self::ENCRYPTION_SMTPS ? 'ssl://' : '';
        $socket = @stream_socket_client($prefix . $this->Host . ':' . $this->Port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT);
        if (!$socket) {
            throw new Exception('SMTP connect failed: ' . $errno . ' ' . $errstr);
        }
        stream_set_timeout($socket, 15);
        return $socket;
    }

    private function command($socket, string $command, array $expected): string
    {
        fwrite($socket, $command . "\r\n");
        return $this->expect($socket, $expected);
    }

    private function expect($socket, array $expected): string
    {
        $response = '';
        do {
            $line = fgets($socket, 515);
            if ($line === false) {
                throw new Exception('SMTP response failed');
            }
            $response .= $line;
        } while (isset($line[3]) && $line[3] === '-');

        $code = (int)substr($response, 0, 3);
        if (!in_array($code, $expected, true)) {
            throw new Exception('Unexpected SMTP response: ' . trim($response));
        }
        return $response;
    }

    private function buildMessage(): string
    {
        $headers = [
            'From: ' . $this->formatAddress($this->from, $this->fromName),
            'To: ' . implode(', ', $this->to),
            'Subject: ' . mb_encode_mimeheader($this->Subject, $this->CharSet, 'B'),
            'Date: ' . date('r'),
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . preg_replace('/^.*@/', '', $this->from) . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=' . $this->CharSet,
            'Content-Transfer-Encoding: base64',
        ];
        if ($this->Sender !== '') {
            $headers[] = 'Sender: ' . $this->Sender;
            $headers[] = 'Return-Path: ' . $this->Sender;
        }
        if ($this->replyTo) {
            $headers[] = 'Reply-To: ' . implode(', ', $this->replyTo);
        }
        return implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($this->Body));
    }

    private function formatAddress(string $address, string $name = ''): string
    {
        if ($name === '') {
            return $address;
        }
        return mb_encode_mimeheader($name, $this->CharSet, 'B') . ' <' . $address . '>';
    }
}
