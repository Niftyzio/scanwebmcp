import { NextResponse } from "next/server";

export interface ApiErrorBody {
  error: string;
  code: string;
  message: string;
  resolution: string;
}

export function apiError(
  code: string,
  message: string,
  resolution: string,
  status: number,
  headers?: HeadersInit,
) {
  const body: ApiErrorBody = { error: message, code, message, resolution };
  return NextResponse.json(body, { status, headers });
}
