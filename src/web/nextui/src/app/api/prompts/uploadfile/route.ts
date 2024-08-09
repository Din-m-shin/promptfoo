import fs from 'fs';
// import { existsSync } from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';
import { getConfigDirectoryPath } from '../../../../../../../util/config';


export async function GET(req: Request, res: Response) {
  const uploadDirectory = path.resolve(getConfigDirectoryPath(true), 'upload_file');
  try {
    // const files = fs.readdirSync(uploadDirectory).filter((file) => file.endsWith('.json'));
    const files = fs
      .readdirSync(uploadDirectory)
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.join(uploadDirectory, file));
    return NextResponse.json({ status: 200, data: files });
  } catch (error) {
    console.error('Error listing JSON files', error);
    return NextResponse.json({ status: 500, error: 'Failed to list JSON files' });
  }
}

export async function POST(req: any, res: Response) {
  const formData = await req.formData();
  const filePath = formData.get('filePath');

  if (!filePath || typeof filePath !== 'string') {
    return NextResponse.json({ status: 400, error: 'No file path provided' });
  }

  const fileFullPath = path.resolve(getConfigDirectoryPath(true), filePath);
  try {
    const fileContent = fs.readFileSync(fileFullPath, 'utf-8');
    return NextResponse.json({ status: 200, data: fileContent });
  } catch (error) {
    console.error('Error reading file', error);
    return NextResponse.json({ status: 500, error: 'Failed to read file' });
  }
}