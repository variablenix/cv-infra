# Infrastructure-as-Code: CV Delivery

This repository contains the infrastructure automation logic for hosting and serving my professional CV at **[cv.aklein.pro](https://aklein.pro)**.

## 🚀 Live Demo
**URL:** [https://aklein.pro](https://aklein.pro)

## 🏗️ The Approach
As an Infrastructure Engineer, I prioritize managing assets through code rather than manual configuration. This project replaces traditional static hosting with a serverless, edge-delivered architecture designed for high availability and optimal user experience.

## 🛠️ The Stack
* **Storage:** Cloudflare R2 (S3-compatible Object Storage)
* **Compute:** Cloudflare Workers (Serverless Edge Runtime)
* **Networking:** Cloudflare DNS with managed SSL/TLS
* **Logic:** `worker.js` handles request-response mapping and header injection

## 📈 SRE Benefits
* **Latency:** The document is served from Cloudflare’s global edge network, ensuring sub-100ms delivery.
* **Reliability:** Decoupled storage (R2) from logic (Workers) allows for instant, zero-downtime document updates without redeploying code.
* **Native Rendering:** The Worker injects `Content-Type: application/pdf` and `Content-Disposition: inline` headers to ensure the CV renders natively in the browser viewer rather than forcing a download.

## 🔄 Deployment Workflow
This repository is part of a self-hosted CI/CD pipeline. 
* **Source of Truth:** Managed on a private **Gitea** instance.
* **Mirroring:** Changes are automatically pushed to this public GitHub repository for visibility and documentation.
* **Updates:** PDF revisions are uploaded to the R2 bucket; the Worker dynamically fetches the latest object on each request.

---
**Note:** This project is a demonstration of using modern serverless primitives to solve a simple hosting problem with an SRE mindset.

