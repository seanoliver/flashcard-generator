import { NextRequest, NextResponse } from 'next/server';

interface Flashcard {
  question: string;
  answer: string;
}

export async function POST(request: NextRequest) {
  try {
    const { flashcards, format }: { flashcards: Flashcard[], format: 'json' | 'csv' } = await request.json();

    if (!flashcards || !Array.isArray(flashcards)) {
      return NextResponse.json({ error: 'Flashcards array is required' }, { status: 400 });
    }

    if (format === 'json') {
      return NextResponse.json(flashcards, {
        headers: {
          'Content-Disposition': 'attachment; filename="flashcards.json"',
          'Content-Type': 'application/json',
        },
      });
    } else if (format === 'csv') {
      const csvHeader = 'Question,Answer\n';
      const csvContent = flashcards
        .map(card => `"${card.question.replace(/"/g, '""')}","${card.answer.replace(/"/g, '""')}"`)
        .join('\n');
      
      const csv = csvHeader + csvContent;

      return new NextResponse(csv, {
        headers: {
          'Content-Disposition': 'attachment; filename="flashcards.csv"',
          'Content-Type': 'text/csv',
        },
      });
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });

  } catch (error) {
    console.error('Error exporting flashcards:', error);
    return NextResponse.json(
      { error: 'Failed to export flashcards' },
      { status: 500 }
    );
  }
}