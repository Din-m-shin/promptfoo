import { getPrompts } from '@/../../../util';
import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';
import fs from 'fs';
import { existsSync } from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';
import { getConfigDirectoryPath } from '../../../../../../util/config';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function POST(req: any, res: Response) {
  const uploadDirectory = path.resolve(getConfigDirectoryPath(true /* createIfNotExists */),'upload_file');
  console.log('uploadDirectory ', uploadDirectory);

  try {
    const formData = await req.formData();
    const file = formData.getAll('files')[0];
    const filePath = `${uploadDirectory}/${file.name}`;

    // console.log('upload filePath ', filePath);

    // Check if the file already exists
    if (existsSync(filePath)) {
      return NextResponse.json({ status: 409, error: "File already exists" });
    }

    const fileArrayBuffer = await file.arrayBuffer();
    await fs.writeFileSync(filePath, Buffer.from(fileArrayBuffer));

    // console.log('upload file ', file);

    return NextResponse.json({ status: 200, data: { size: file.size, name: file.name, path: filePath} });
  } catch (e) {
    return NextResponse.json({ status: 500, data: e });
  }
}

export async function GET(req: Request) {
  if (USE_SUPABASE || IS_RUNNING_LOCALLY) {
    return NextResponse.json({ error: 'Not implemented' });
  }
  try {
    return NextResponse.json({ data: await getPrompts() });
  } catch (error) {
    console.error('Failed to get prompts', error);
    return NextResponse.json(
      { error: 'Failed to get prompts', details: (error as Error).toString() },
      { status: 500 },
    );
  }
}
